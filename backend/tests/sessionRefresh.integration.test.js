const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const IAR = require('../src/models/InspectionAcceptanceReport');
const Item = require('../src/models/Item');
const Inventory = require('../src/models/Inventory');
const RIS = require('../src/models/RequisitionIssueSlip');

test('an expired access session refreshes safely before saving the original IAR draft', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') },
  });
  await mongoose.connect(database.getUri());
  await Promise.all([User, IAR, Item, Inventory, RIS].map(Model => Model.init()));
  const server = require('../src/app').listen(0);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await database.stop();
  });
  const password = 'SessionTest123!';
  const makeUser = async username => User.create({ username, firstName: 'Supply', lastName: 'Officer', email: `${username}@example.test`, password: await bcrypt.hash(password, 10), role: 'admin', office: 'Supply', division: 'General Services', resetToken: 'private-reset-hash', emailChangeCode: 'private-email-code' });
  const admin = await makeUser('session-admin');
  const other = await makeUser('session-other');
  const accessSecret = process.env.JWT_SECRET || 'dev-secret';
  const refreshSecret = process.env.JWT_REFRESH_SECRET || 'refresh-secret';
  const accessToken = user => jwt.sign({ id: user._id, role: user.role }, accessSecret, { expiresIn: '1h' });
  const expiredAccess = jwt.sign({ id: admin._id, role: 'admin' }, accessSecret, { expiresIn: -1 });
  const request = async (url, { body, method = body === undefined ? 'GET' : 'POST', token, cookie } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() };
  };
  const sessionCookie = (refreshToken, token = expiredAccess) => `token=${token}; refreshToken=${refreshToken}`;
  const receipt = { entityName: 'Municipality of Carigara', fundCluster: 'General Fund', iarNumber: '1001', autoNumber: false, iarDate: '2026-10-08', invoiceNumber: 'INV-SESSION', invoiceDate: '', acceptanceQuantity: '', acceptanceStatus: 'Complete', custodian: 'Supply Officer', items: [{ stockPropertyNumber: 'SESSION-PAPER', description: 'Bond paper', unit: 'ream', quantity: 5, unitCost: 250, itemType: 'SUPPLY' }] };
  let refreshToken;
  let refreshedAccess;

  await t.test('remembered login sets a persistent refresh cookie and returns no private token fields', async () => {
    const login = await request('/auth/login', { body: { identifier: admin.username, password, rememberMe: true } });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    const refreshCookie = login.cookies.find(cookie => cookie.startsWith('refreshToken='));
    assert.match(refreshCookie, /HttpOnly/i);
    assert.match(refreshCookie, /Max-Age=604800/i);
    assert.match(login.cookies.find(cookie => cookie.startsWith('token=')), /Max-Age=3600/i);
    refreshToken = decodeURIComponent(refreshCookie.split(';')[0].slice('refreshToken='.length));
    assert.equal((await User.findById(admin._id)).refreshToken, refreshToken);
    assert.equal(login.body.data.user.refreshToken, undefined);
    assert.equal(login.body.data.user.password, undefined);
    assert.equal(login.body.data.user.resetToken, undefined);
    assert.equal(login.body.data.user.emailChangeCode, undefined);
  });

  await t.test('expired access posts nothing, then refresh allows exactly one original IAR submission', async () => {
    const rejected = await request('/iar', { body: receipt, token: expiredAccess, cookie: sessionCookie(refreshToken) });
    assert.equal(rejected.status, 401);
    assert.equal(await IAR.countDocuments(), 0);
    assert.equal(await Item.countDocuments(), 0);
    const refreshed = await request('/auth/refresh', { body: {}, cookie: sessionCookie(refreshToken) });
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
    refreshedAccess = refreshed.body.data.accessToken;
    assert.ok(jwt.verify(refreshedAccess, accessSecret));
    assert.equal(refreshed.body.data.user.password, undefined);
    assert.equal(refreshed.body.data.user.refreshToken, undefined);
    assert.equal(refreshed.body.data.user.resetToken, undefined);
    assert.equal(refreshed.body.data.user.emailChangeCode, undefined);
    assert.equal((await User.findById(admin._id)).refreshToken, refreshToken);
    assert.equal(refreshed.cookies.some(cookie => cookie.startsWith('refreshToken=')), false, 'Refreshing must not extend or rotate the original refresh cookie');
    const saved = await request('/iar', { body: receipt, token: refreshedAccess, cookie: sessionCookie(refreshToken) });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    assert.equal(saved.body.data.iarNumber, receipt.iarNumber);
    assert.equal(saved.body.data.invoiceNumber, receipt.invoiceNumber);
    assert.equal(await IAR.countDocuments(), 1);
    assert.equal(await Inventory.countDocuments(), 1);
    assert.equal((await Item.findOne({ stockNumber: 'SESSION-PAPER' })).quantityOnHand, 5);
  });

  await t.test('a valid bearer token wins over a stale cookie on both me and protected forms', async () => {
    assert.equal((await request('/auth/me', { token: refreshedAccess, cookie: `token=${expiredAccess}` })).status, 200);
    assert.equal((await request('/iar', { token: refreshedAccess, cookie: `token=${expiredAccess}` })).status, 200);
    assert.equal((await request('/auth/me', { token: 'invalid', cookie: `token=${refreshedAccess}` })).status, 401);
    assert.equal((await request('/iar', { token: expiredAccess, cookie: `token=${refreshedAccess}` })).status, 401);
  });

  await t.test('parallel refreshes retain the original refresh token and deadline', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => request('/auth/refresh', { body: {}, cookie: sessionCookie(refreshToken) })));
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.ok(jwt.decode(response.body.data.accessToken).exp <= jwt.decode(refreshToken).exp);
    }
    assert.equal((await User.findById(admin._id)).refreshToken, refreshToken);
  });

  await t.test('missing, forged, expired, revoked and body-only refresh credentials are denied', async () => {
    const expiredRefresh = jwt.sign({ id: admin._id }, refreshSecret, { expiresIn: -1 });
    const revokedRefresh = jwt.sign({ id: admin._id, jti: 'revoked-session' }, refreshSecret, { expiresIn: '1h' });
    const forgedRefresh = jwt.sign({ id: admin._id }, 'wrong-refresh-secret', { expiresIn: '1h' });
    for (const cookie of [undefined, 'refreshToken=invalid', `refreshToken=${expiredRefresh}`, `refreshToken=${revokedRefresh}`, `refreshToken=${forgedRefresh}`]) {
      const response = await request('/auth/refresh', { body: {}, cookie });
      assert.equal(response.status, 401, JSON.stringify(response.body));
      assert.equal(response.body.data?.accessToken, undefined);
    }
    assert.equal((await request('/auth/refresh', { body: { refreshToken } })).status, 401);
    assert.equal((await User.findById(admin._id)).refreshToken, refreshToken);
  });

  await t.test('inactive, deleted, locked and temporarily locked users cannot refresh or use valid access tokens', async () => {
    for (const state of [{ status: 'inactive' }, { deleted: true }, { locked: true }, { lockUntil: new Date(Date.now() + 60000) }]) {
      await User.updateOne({ _id: admin._id }, { $set: state });
      assert.equal((await request('/auth/refresh', { body: {}, cookie: sessionCookie(refreshToken) })).status, 401);
      assert.equal((await request('/auth/me', { token: refreshedAccess })).status, 401);
      assert.equal((await request('/iar', { token: refreshedAccess })).status, 401);
      await User.updateOne({ _id: admin._id }, { $set: { status: 'active', deleted: false, locked: false }, $unset: { lockUntil: 1 } });
    }
  });

  await t.test('access renewed near the original refresh deadline cannot outlive it', async () => {
    const shortRefresh = jwt.sign({ id: admin._id, jti: 'near-deadline' }, refreshSecret, { expiresIn: 30 });
    await User.updateOne({ _id: admin._id }, { $set: { refreshToken: shortRefresh } });
    const response = await request('/auth/refresh', { body: {}, cookie: sessionCookie(shortRefresh) });
    assert.equal(response.status, 200);
    assert.ok(jwt.decode(response.body.data.accessToken).exp <= jwt.decode(shortRefresh).exp);
    assert.ok(jwt.decode(response.body.data.accessToken).exp - jwt.decode(response.body.data.accessToken).iat < 30);
    assert.equal((await User.findById(admin._id)).refreshToken, shortRefresh);
    await User.updateOne({ _id: admin._id }, { $set: { refreshToken } });
  });

  await t.test('logout after access expiry revokes only its verified stored refresh session', async () => {
    const otherRefresh = jwt.sign({ id: other._id, jti: 'other-session' }, refreshSecret, { expiresIn: '7d' });
    await User.updateOne({ _id: other._id }, { $set: { refreshToken: otherRefresh } });
    const logout = await request('/auth/logout', { body: {}, token: expiredAccess, cookie: sessionCookie(refreshToken) });
    assert.equal(logout.status, 200);
    assert.equal((await User.findById(admin._id)).refreshToken, null);
    assert.equal((await request('/auth/refresh', { body: {}, cookie: sessionCookie(refreshToken) })).status, 401);
    assert.equal((await User.findById(other._id)).refreshToken, otherRefresh);
    // A revoked cookie must not revoke a newer refresh session for that account.
    const renewedRefresh = jwt.sign({ id: admin._id, jti: 'newer-session' }, refreshSecret, { expiresIn: '7d' });
    await User.updateOne({ _id: admin._id }, { $set: { refreshToken: renewedRefresh } });
    assert.equal((await request('/auth/logout', { body: {}, cookie: sessionCookie(refreshToken) })).status, 200);
    assert.equal((await User.findById(admin._id)).refreshToken, renewedRefresh);
    // A valid access header for admin must not revoke another account's cookie.
    assert.equal((await request('/auth/logout', { body: {}, token: accessToken(admin), cookie: sessionCookie(otherRefresh) })).status, 200);
    assert.equal((await User.findById(other._id)).refreshToken, otherRefresh);
  });

  await t.test('non-remembered login keeps a bounded browser-session refresh cookie', async () => {
    const login = await request('/auth/login', { body: { identifier: admin.username, password, rememberMe: false } });
    assert.equal(login.status, 200);
    const refreshCookie = login.cookies.find(cookie => cookie.startsWith('refreshToken='));
    assert.match(refreshCookie, /HttpOnly/i);
    assert.doesNotMatch(refreshCookie, /Max-Age|Expires=/i);
    const value = decodeURIComponent(refreshCookie.split(';')[0].slice('refreshToken='.length));
    const claims = jwt.verify(value, refreshSecret);
    assert.equal(claims.exp - claims.iat, 7 * 24 * 60 * 60);
  });
});
