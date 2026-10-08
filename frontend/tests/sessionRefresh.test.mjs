import assert from 'node:assert/strict';
import test from 'node:test';
import axios, { AxiosError } from 'axios';
import { authTokenKey, installSessionRefresh, legacyAuthTokenKey } from '../src/utils/sessionRefresh.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const response = (config, data = {}) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const rejectStatus = (config, status) => {
  throw new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE', config, undefined, {
    ...response(config, { message: 'Invalid Token' }), status,
  });
};
const harness = (adapter, entries = { [authTokenKey]: 'expired-token' }) => {
  const values = new Map(Object.entries(entries));
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const client = axios.create({ baseURL: 'http://localhost:5000/api', adapter });
  const session = installSessionRefresh(client, { storage });
  return { client, session, storage };
};

test('concurrent expired form saves share one refresh and retry their exact original payloads once', async () => {
  const refreshStarted = deferred();
  const finishRefresh = deferred();
  const attempts = [];
  let refreshCalls = 0;
  const { client, storage } = harness(async (config) => {
    if (config.url === '/auth/refresh') {
      refreshCalls += 1;
      assert.equal(config.headers.get('Authorization'), null);
      refreshStarted.resolve();
      await finishRefresh.promise;
      return response(config, { data: { accessToken: 'new-token' } });
    }
    attempts.push({ url: config.url, data: config.data, authorization: config.headers.get('Authorization') });
    if (config.headers.get('Authorization') === 'Bearer expired-token') rejectStatus(config, 401);
    return response(config, { data: { saved: true } });
  });
  const iar = { iarNo: '2026-10-001', items: [{ description: 'Printer', quantity: 2 }] };
  const ris = { purpose: 'Office supplies', items: [{ stockNo: 'P-1', quantity: 4 }] };
  const saves = Promise.all([client.post('/iar', iar), client.post('/ris', ris)]);
  await refreshStarted.promise;
  finishRefresh.resolve();
  await saves;

  assert.equal(refreshCalls, 1);
  assert.equal(attempts.length, 4);
  for (const [url, body] of [['/iar', iar], ['/ris', ris]]) {
    const requestAttempts = attempts.filter((entry) => entry.url === url);
    assert.deepEqual(requestAttempts.map((entry) => entry.data), [JSON.stringify(body), JSON.stringify(body)]);
    assert.deepEqual(requestAttempts.map((entry) => entry.authorization), ['Bearer expired-token', 'Bearer new-token']);
  }
  assert.equal(storage.getItem(authTokenKey), 'new-token');
  assert.equal(client.defaults.headers.common.Authorization, 'Bearer new-token');
});

test('a delayed unauthorized response uses an already refreshed token without a second refresh', async () => {
  const releaseOldResponse = deferred();
  const oldRequestStarted = deferred();
  let refreshCalls = 0;
  const { client } = harness(async (config) => {
    if (config.url === '/auth/refresh') {
      refreshCalls += 1;
      return response(config, { data: { accessToken: 'new-token' } });
    }
    if (config.headers.get('Authorization') === 'Bearer expired-token') {
      if (config.url === '/iar') {
        oldRequestStarted.resolve();
        await releaseOldResponse.promise;
      }
      rejectStatus(config, 401);
    }
    return response(config);
  });
  const delayed = client.post('/iar', { iarNo: '2026-10-002' });
  await oldRequestStarted.promise;
  await client.get('/auth/me');
  releaseOldResponse.resolve();
  await delayed;
  assert.equal(refreshCalls, 1);
});

test('rejected refresh fails safely, keeps original request data, and does not replay a save', async () => {
  const calls = [];
  const { client, storage } = harness(async (config) => {
    calls.push(config.url);
    rejectStatus(config, 401);
  });
  const payload = { iarNo: 'manual-number', items: [{ quantity: 3 }] };
  await assert.rejects(client.post('/iar', payload), (error) => {
    assert.equal(error.code, 'SESSION_EXPIRED');
    assert.equal(error.response.status, 401);
    assert.match(error.response.data.message, /Please sign in again/);
    assert.equal(error.config.data, JSON.stringify(payload));
    return true;
  });
  assert.deepEqual(calls, ['/iar', '/auth/refresh']);
  assert.equal(storage.getItem(authTokenKey), null);
  await assert.rejects(client.get('/items'), { code: 'SESSION_EXPIRED' });
  assert.deepEqual(calls, ['/iar', '/auth/refresh', '/items']);
});

test('a second unauthorized response is bounded to one refresh and one retry', async () => {
  const calls = [];
  const { client } = harness(async (config) => {
    calls.push(config.url);
    if (config.url === '/auth/refresh') return response(config, { data: { accessToken: 'new-token' } });
    rejectStatus(config, 401);
  });
  await assert.rejects(client.post('/iar', { items: [] }), { code: 'SESSION_EXPIRED' });
  assert.deepEqual(calls, ['/iar', '/auth/refresh', '/iar']);
});

test('login, password recovery, logout, refresh, external requests, and non-401 errors are not retried', async () => {
  const calls = [];
  const { client } = harness(async (config) => {
    calls.push(config.url);
    rejectStatus(config, config.url.startsWith('/status/') ? Number(config.url.split('/').at(-1)) : 401);
  });
  const paths = [
    '/auth/login', '/auth/logout', '/auth/forgot-password', '/auth/reset-password', '/auth/refresh',
    'https://example.com/other-api/iar', '/status/400', '/status/403', '/status/409', '/status/500',
  ];
  for (const path of paths) await assert.rejects(client.post(path, { value: 'unchanged' }));
  assert.deepEqual(calls, paths);
});

test('logout invalidates a pending refresh before it can restore tokens or replay a save', async () => {
  const refreshStarted = deferred();
  const finishRefresh = deferred();
  const calls = [];
  const { client, session, storage } = harness(async (config) => {
    calls.push(config.url);
    if (config.url === '/auth/refresh') {
      refreshStarted.resolve();
      await finishRefresh.promise;
      return response(config, { data: { accessToken: 'must-not-restore' } });
    }
    rejectStatus(config, 401);
  });
  const saveRejected = assert.rejects(client.post('/iar', { iarNo: 'draft' }), { code: 'SESSION_EXPIRED' });
  await refreshStarted.promise;
  const waitForRefreshBeforeLogout = session.beginLogout();
  finishRefresh.resolve();
  await waitForRefreshBeforeLogout;
  session.clearToken();
  await saveRejected;
  assert.deepEqual(calls, ['/iar', '/auth/refresh']);
  assert.equal(storage.getItem(authTokenKey), null);
  assert.equal(client.defaults.headers.common.Authorization, undefined);
});

test('legacy token migration and reinstallation do not duplicate recovery interceptors', async () => {
  let refreshCalls = 0;
  let saveCalls = 0;
  const { client, storage } = harness(async (config) => {
    if (config.url === '/auth/refresh') {
      refreshCalls += 1;
      return response(config, { data: { accessToken: 'new-token' } });
    }
    saveCalls += 1;
    if (config.headers.get('Authorization') === 'Bearer legacy-token') rejectStatus(config, 401);
    return response(config);
  }, { [legacyAuthTokenKey]: 'legacy-token' });
  assert.equal(storage.getItem(legacyAuthTokenKey), null);
  assert.equal(storage.getItem(authTokenKey), 'legacy-token');
  installSessionRefresh(client, { storage });
  await client.post('/iar', { iarNo: '2026-10-003' });
  assert.equal(refreshCalls, 1);
  assert.equal(saveCalls, 2);
});
