const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');

test('profile picture upload persists only to the authenticated admin and validates files', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  const server = require('../src/app').listen(0);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await database.stop(); });
  const makeUser = (username, role = 'user') => User.create({ username, role, firstName: username, lastName: 'Test', email: `${username}@example.test`, password: 'test', office: 'Supply', division: 'Supply' });
  const admin = await makeUser('records-admin', 'admin');
  const user = await makeUser('records-user');
  const other = await makeUser('records-other');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
  const upload = async (actor, bytes, type = 'image/png') => {
    const form = new FormData(); form.append('picture', new Blob([bytes], { type }), 'photo.png');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/profile-picture`, { method: 'POST', headers: { Authorization: `Bearer ${jwt.sign({ id: actor._id }, process.env.JWT_SECRET || 'dev-secret')}` }, body: form });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await upload(admin, png)).status, 200);
  assert.equal((await User.findById(admin._id)).profilePicture, `data:image/png;base64,${png.toString('base64')}`);
  assert.equal((await User.findById(other._id)).profilePicture, undefined);
  assert.equal((await upload(user, png)).status, 403);
  assert.equal((await upload(admin, Buffer.from('<svg></svg>'))).status, 400);
  assert.equal((await upload(admin, Buffer.alloc(2 * 1024 * 1024 + 1))).status, 400);
  assert.equal((await User.findById(admin._id)).profilePicture, `data:image/png;base64,${png.toString('base64')}`, 'Rejected uploads preserve the saved picture');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, { headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'dev-secret')}` } });
  assert.equal((await response.json()).data.user.profilePicture, `data:image/png;base64,${png.toString('base64')}`);
});
