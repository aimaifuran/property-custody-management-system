const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const Setting = require('../src/models/Setting');

test('developer pictures persist separately, are viewable by users and editable only by admins', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  const server = require('../src/app').listen(0);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await database.stop(); });
  const makeUser = (username, role = 'user') => User.create({ username, role, firstName: username, lastName: 'Test', email: `${username}@example.test`, password: 'test', office: 'Supply', division: 'Supply' });
  const admin = await makeUser('records-admin', 'admin');
  const user = await makeUser('records-user');
  const other = await makeUser('records-other');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
  const upload = async (actor, bytes, type = 'image/png', id = 'developer-0') => {
    const form = new FormData(); form.append('picture', new Blob([bytes], { type }), 'photo.png');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/about/developer-pictures/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${jwt.sign({ id: actor._id }, process.env.JWT_SECRET || 'dev-secret')}` }, body: form });
    return { status: response.status, body: await response.json() };
  };

  assert.equal((await upload(admin, png)).status, 200);
  assert.equal((await Setting.findOne()).developerPictures.get('developer-0'), `data:image/png;base64,${png.toString('base64')}`);
  assert.equal((await Setting.findOne()).developerPictures.get('developer-1'), undefined);
  assert.equal((await upload(user, png)).status, 403);
  assert.equal((await upload(admin, png, 'image/png', 'developer-5')).status, 404);
  assert.equal((await upload(admin, Buffer.from('<svg></svg>'))).status, 400);
  assert.equal((await upload(admin, Buffer.alloc(2 * 1024 * 1024 + 1))).status, 400);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/about/developer-pictures`, { headers: { Authorization: `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'dev-secret')}` } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data['developer-0'], `data:image/png;base64,${png.toString('base64')}`);
  assert.equal((await User.findById(admin._id)).profilePicture, undefined, 'Developer upload does not change the admin avatar');
});
