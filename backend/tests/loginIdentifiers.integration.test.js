const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');

test('admin and user accounts sign in by username or registered email', { timeout: 60000 }, async t => {
  const database = await MongoMemoryServer.create({ binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  const server = require('../src/app').listen(0);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await database.stop();
  });
  const password = 'SignInTest123!';
  const hash = await bcrypt.hash(password, 4);
  const login = async (identifier, secret = password) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password: secret }) });
    return { status: response.status, body: await response.json() };
  };
  for (const role of ['admin', 'user']) {
    const account = await User.create({ username: `${role}-login`, email: `${role}.login+test@example.test`, password: hash, role, firstName: 'Login', lastName: 'Test', office: 'Supply', division: 'Supply' });
    for (const identifier of [account.username, account.email, `  ${account.email.toUpperCase()}  `]) {
      const response = await login(identifier);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.data.user._id, String(account._id));
      assert.equal(response.body.data.user.password, undefined);
    }
    if (role === 'admin') {
      // Legacy records may predate normalized email storage.
      await User.collection.updateOne({ _id: account._id }, { $set: { email: account.email.toUpperCase() } });
      assert.equal((await login(account.email)).status, 200);
      assert.equal((await login(account.email, 'WrongPassword')).status, 401);
    }
  }
  assert.equal((await login({ $ne: null })).status, 400);
  assert.equal((await login('   ')).status, 400);
});
