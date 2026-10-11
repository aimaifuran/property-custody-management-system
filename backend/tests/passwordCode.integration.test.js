const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const PasswordResetRequest = require('../src/models/PasswordResetRequest');

test('users and admins reset with registered-email codes without approval', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  const mailer = require('../src/utils/mailer');
  const original = mailer.sendPasswordResetCode;
  const messages = [];
  mailer.sendPasswordResetCode = async (user, code) => messages.push({ email: user.email, code });
  const server = require('../src/app').listen(0);
  t.after(async () => { mailer.sendPasswordResetCode = original; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await database.stop(); });
  const post = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const makeUser = (name, role = 'user') => User.create({ username: name, email: `${name}@example.test`, role, firstName: name, lastName: 'Test', password: 'old', office: 'Supply', division: 'Supply', refreshToken: 'old-session' });
  for (const role of ['user', 'admin']) {
    const user = await makeUser(role, role);
    const sent = await post('forgot-password', { email: user.email.toUpperCase() });
    assert.equal(sent.status, 200);
    if (role === 'user') {
      const previousHash = (await User.findById(user._id).select('+passwordResetCode')).passwordResetCode;
      assert.equal((await post('forgot-password', { email: user.email })).status, 200);
      const replacement = await User.findById(user._id).select('+passwordResetCode');
      assert.equal(replacement.passwordResetCode, crypto.createHash('sha256').update(messages.at(-1).code).digest('hex'));
      // Reissuing replaces the saved challenge rather than keeping multiple valid codes.
      assert.ok(previousHash);
    }
    const code = messages.at(-1).code;
    assert.match(code, /^\d{6}$/);
    const stored = await User.findById(user._id).select('+passwordResetCode');
    assert.notEqual(stored.passwordResetCode, code);
    assert.equal((await User.findById(user._id)).toJSON().passwordResetCode, undefined);
    const reset = await post('reset-password-code', { email: user.email, code, password: 'Updated123!' });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    const updated = await User.findById(user._id).select('+passwordResetCode');
    assert.equal(await bcrypt.compare('Updated123!', updated.password), true);
    assert.equal(updated.refreshToken, undefined);
    assert.equal(updated.passwordResetCode, undefined);
    if (role === 'user') assert.equal((await post('reset-password-code', { email: user.email, code, password: 'Replay123!' })).status, 400);
  }
  assert.equal(await PasswordResetRequest.countDocuments(), 0, 'No administrator approval required');
  const unknown = await post('forgot-password', { email: 'unknown@example.test' });
  assert.equal(unknown.status, 200);
  assert.equal(messages.length, 3);
  const expired = await makeUser('expired');
  const hash = crypto.createHash('sha256').update('123456').digest('hex');
  await User.updateOne({ _id: expired._id }, { $set: { passwordResetCode: hash, passwordResetCodeExpiry: new Date(Date.now() - 1000), passwordResetCodeAttempts: 0 } });
  assert.equal((await post('reset-password-code', { email: expired.email, code: '123456', password: 'Updated123!' })).status, 400);
  const guessed = await makeUser('guessed');
  await User.updateOne({ _id: guessed._id }, { $set: { passwordResetCode: hash, passwordResetCodeExpiry: new Date(Date.now() + 600000), passwordResetCodeAttempts: 0 } });
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await post('reset-password-code', { email: guessed.email, code: '999999', password: 'Updated123!' })).status, 400);
  assert.equal((await post('reset-password-code', { email: guessed.email, code: '123456', password: 'Updated123!' })).status, 400, 'Exhausted codes cannot reset passwords');
  assert.equal((await User.findById(guessed._id)).password, 'old');
});
