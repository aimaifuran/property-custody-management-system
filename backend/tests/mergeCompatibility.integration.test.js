const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');
const RIS = require('../src/models/RequisitionIssueSlip');
const PropertyReturnSlip = require('../src/models/PropertyReturnSlip');
const mailer = require('../src/utils/mailer');

test('merged deployment routes, list responses, login locks and password recovery remain compatible', { timeout: 60000 }, async t => {
  const database = await MongoMemoryServer.create({ binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  const originalMailer = mailer.sendPasswordResetEmail;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://frontend.example.test';
  let resetUrl;
  mailer.sendPasswordResetEmail = async (_user, url) => { resetUrl = url; };
  const app = require('../src/app');
  assert.equal(app.get('trust proxy'), 1);
  const server = app.listen(0);
  t.after(async () => {
    mailer.sendPasswordResetEmail = originalMailer;
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await database.stop();
  });
  const password = await bcrypt.hash('Valid123!', 4);
  const makeUser = (username, role = 'user', extra = {}) => User.create({ firstName: username, lastName: 'Test', username, email: `${username}@example.test`, password, office: 'Supply', division: 'Supply', role, permissions: ['canViewRIS'], ...extra });
  const admin = await makeUser('admin', 'admin');
  const owner = await makeUser('owner'); const other = await makeUser('other');
  const request = async (person, route, method = 'GET', body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (person) headers.Authorization = `Bearer ${jwt.sign({ id: person._id }, process.env.JWT_SECRET || 'dev-secret')}`;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  };

  for (const route of ['/api/reports/summary', '/api/dashboard/summary', '/api/dashboard', '/api/reports']) {
    const response = await request(admin, route);
    assert.equal(response.status, 200, route); assert.equal(response.body.message, 'Dashboard summary');
    assert.equal((await request(owner, route)).status, 403);
  }
  await RIS.create([
    { risNumber: 'OWN-1', purpose: 'Matching request', requestedBy: { user: owner._id } },
    { risNumber: 'OTHER-1', purpose: 'Matching request', requestedBy: { user: other._id } },
  ]);
  assert.equal(Array.isArray((await request(owner, '/api/ris')).body.data), true);
  const searched = await request(owner, '/api/ris?page=1&limit=1&search=Matching');
  assert.equal(searched.status, 200); assert.equal(searched.body.data.items.length, 1);
  assert.equal(searched.body.data.items[0].risNumber, 'OWN-1');
  assert.equal(searched.body.data.pagination.total, 1);
  assert.equal((await request(owner, '/api/ris?search=OTHER-1')).body.data.items.length, 0);
  await PropertyReturnSlip.create({ lguName: 'Carigara', returnedBy: { name: 'Owner' }, items: [] });
  for (const route of ['/api/iar', '/api/ics', '/api/par', '/api/property-cards', '/api/prs', '/api/returned-supply', '/api/ptr']) {
    assert.equal(Array.isArray((await request(admin, route)).body.data), true, route);
    const paged = await request(admin, `${route}?page=1&limit=1&search=Carigara`);
    assert.equal(paged.status, 200, route); assert.equal(Array.isArray(paged.body.data.items), true, route);
    assert.equal(paged.body.data.pagination.limit, 1);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request(null, '/api/auth/login', 'POST', { identifier: 'owner', password: 'wrong' });
    assert.equal(response.status, attempt === 4 ? 423 : 401);
  }
  assert.equal((await request(null, '/api/auth/login', 'POST', { identifier: 'owner', password: 'Valid123!' })).status, 423);
  await User.updateOne({ _id: owner._id }, { $set: { lockUntil: new Date(0), refreshToken: 'private-refresh', resetToken: 'private-reset', emailChangeCode: 'private-code' } });
  const login = await request(null, '/api/auth/login', 'POST', { identifier: 'owner', password: 'Valid123!' });
  assert.equal(login.status, 200);
  for (const field of ['password', 'refreshToken', 'resetToken', 'emailChangeCode']) assert.equal(login.body.data.user[field], undefined);
  const me = await request(owner, '/api/auth/me');
  for (const field of ['password', 'refreshToken', 'resetToken', 'emailChangeCode']) assert.equal(me.body.data.user[field], undefined);
  await User.updateOne({ _id: other._id }, { $set: { locked: true } });
  assert.equal((await request(null, '/api/auth/login', 'POST', { identifier: 'other', password: 'Valid123!' })).status, 423);
  assert.equal((await request(null, '/api/auth/forgot-password', 'POST', { identifier: 'owner' })).status, 200);
  assert.equal(new URL(resetUrl).origin, 'https://frontend.example.test');
  const rawToken = new URL(resetUrl).searchParams.get('token');
  const saved = await User.findById(owner._id);
  assert.equal(saved.resetToken, crypto.createHash('sha256').update(rawToken).digest('hex'));
  assert.equal((await request(null, '/api/auth/reset-password', 'POST', { token: rawToken, password: 'NewValid123!' })).status, 200);
  assert.equal((await request(null, '/api/auth/reset-password', 'POST', { token: rawToken, password: 'NewValid123!' })).status, 400);
  assert.equal(await bcrypt.compare('NewValid123!', (await User.findById(owner._id)).password), true);
});
