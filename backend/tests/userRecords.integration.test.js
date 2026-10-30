const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const RIS = require('../src/models/RequisitionIssueSlip');
const PRS = require('../src/models/PropertyReturnSlip');
const PTR = require('../src/models/PropertyTransferReport');

test('admin records are scoped, read-only and inaccessible to users', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  const server = require('../src/app').listen(0);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await database.stop(); });
  const makeUser = (username, role = 'user') => User.create({ username, role, firstName: username, lastName: 'Test', email: `${username}@example.test`, password: 'test', office: 'Supply', division: 'Supply' });
  const admin = await makeUser('records-admin', 'admin');
  const user = await makeUser('records-user');
  const other = await makeUser('records-other');
  const record = await RIS.create({ risNumber: 'RECORD-1', requestedBy: { user: user._id }, status: 'ISSUED', items: [{ description: 'Laptop', quantityIssued: 2 }] });
  await RIS.create({ risNumber: 'OTHER-1', requestedBy: { user: other._id }, status: 'ISSUED', items: [{ description: 'Private item', quantityIssued: 1 }] });
  const receivedByUser = await RIS.create({ risNumber: 'RECEIVED-1', requestedBy: { user: other._id }, receivedBy: { user: user._id }, status: 'ISSUED', items: [{ description: 'Received paper', quantityIssued: 3 }] });
  const returnSlip = await PRS.create({ prsNumber: 'RETURN-1', submittedBy: user._id, returnedBy: { user: user._id, name: 'records-user Test' }, status: 'RETURNED', items: [{ ris: record._id, risItem: record.items[0]._id, description: 'Laptop', quantity: 1 }] });
  const linkedTransfer = await PTR.create({
    ptrNumber: 'RETURN-TRANSFER-1',
    toUser: other._id,
    fromAccountableOfficer: 'records-user Test',
    toAccountableOfficer: 'records-other Test',
    status: 'RECORDED',
    items: [{ returnSlip: returnSlip._id, returnSlipItem: returnSlip.items[0]._id, itemName: 'Laptop', quantity: 1 }],
  });
  const pendingRequests = [];
  for (const status of ['DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'REVIEWED', 'APPROVED', 'REJECTED']) {
    pendingRequests.push(await RIS.create({ risNumber: `PENDING-${status}`, requestedBy: { user: user._id }, status, items: [{ description: `Pending item ${status}`, quantityRequested: 2, quantityIssued: 2 }] }));
  }
  const before = JSON.stringify(await RIS.find().lean());
  const get = async (actor, target) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api/users/${target}/records`, { headers: { Authorization: `Bearer ${jwt.sign({ id: actor._id }, process.env.JWT_SECRET || 'dev-secret')}` } }); return { status: response.status, body: await response.json() }; };
  const result = await get(admin, user._id);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.risRows.length, 8);
  const issuedRow = result.body.data.risRows.find(row => row.risId === String(record._id));
  assert.equal(issuedRow.description, 'Laptop');
  assert.equal(issuedRow.quantityReturned, 1);
  const receivedRow = result.body.data.risRows.find(row => row.risId === String(receivedByUser._id));
  assert.equal(receivedRow.description, 'Received paper');
  assert.equal(receivedRow.quantityRemaining, 3);
  assert.ok(result.body.data.risRows.filter(row => !row.issued).every(row => row.quantityIssued === 0 && row.quantityRemaining === 0));
  assert.equal(result.body.data.returnSlips.length, 1);
  assert.equal(result.body.data.transfers, undefined);
  const outgoingTransfer = result.body.data.transferRecords.find(report => String(report._id) === String(linkedTransfer._id));
  assert.equal(outgoingTransfer?.direction, 'OUTGOING');
  const receiverResult = await get(admin, other._id);
  assert.equal(receiverResult.status, 200);
  assert.equal(receiverResult.body.data.risRows.some(row => row.risId === String(receivedByUser._id)), false, 'issued supply is listed only under the receiving account');
  assert.equal(receiverResult.body.data.transfers, undefined);
  const incomingTransfer = receiverResult.body.data.transferRecords.find(report => String(report._id) === String(linkedTransfer._id));
  assert.equal(incomingTransfer?.direction, 'INCOMING');
  assert.equal(JSON.stringify(await RIS.find().lean()), before, 'GET does not mutate records');
  assert.equal((await get(user, other._id)).status, 403);
  assert.equal((await get(admin, admin._id)).status, 404);
  assert.equal((await get(admin, 'invalid')).status, 400);  for (const request of pendingRequests) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/users/${user._id}/records/returned`, { method: 'POST', headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ risId: request._id, itemId: request.items[0]._id, quantity: 1, condition: 'Serviceable' }) });
    assert.equal(response.status, 409, request.status);
  }
  assert.equal(await PRS.countDocuments(), 1, 'Unapproved requests create no return records');

  // Add User supports both roles, with role-based access enforced by the API.
  const accountRequest = async (actor, path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { Authorization: `Bearer ${jwt.sign({ id: actor._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const activity = await accountRequest(admin, '/users/record-activity');
  assert.equal(activity.status, 200);
  assert.ok(activity.body.data[String(user._id)] > 0);
  assert.ok(activity.body.data[String(other._id)] > 0);
  assert.equal((await accountRequest(user, '/users/record-activity')).status, 403);
  for (const role of ['admin', 'user']) {
    const created = await accountRequest(admin, '/users', 'POST', { firstName: 'New', lastName: role, username: `new-${role}`, email: `new-${role}@example.test`, password: 'AccountTest123!', office: 'Supply', division: 'Supply', role, permissions: ['canManageUsers', 'canManageInventory'] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const actor = { _id: created.body.data._id };
    assert.equal(created.body.data.role, role);
    assert.deepEqual(created.body.data.permissions, role === 'admin' ? [] : ['canViewRIS']);
    assert.equal((await accountRequest(actor, '/items')).status, role === 'admin' ? 200 : 403);
    assert.equal((await accountRequest(actor, '/users')).status, role === 'admin' ? 200 : 403);
    const accountDetails = { firstName: 'New', lastName: role, username: `new-${role}`, email: `updated-${role}@example.test`, office: 'Supply', division: 'Supply', role: role === 'admin' ? 'user' : 'admin' };
    await User.updateOne({ _id: actor._id }, { $set: { resetToken: 'old-reset', refreshToken: 'old-session', failedLoginAttempts: 4 } });
    const updated = await accountRequest(admin, `/users/${actor._id}`, 'PUT', { ...accountDetails, password: 'Recovered123!' });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.email, accountDetails.email);
    assert.equal(updated.body.data.role, role, 'Credential edits retain account type');
    assert.equal(updated.body.data.password, undefined);
    const recovered = await User.findById(actor._id);
    assert.ok(await require('bcrypt').compare('Recovered123!', recovered.password));
    assert.equal(recovered.resetToken, undefined);
    assert.equal(recovered.refreshToken, undefined);
    assert.equal(recovered.failedLoginAttempts, 0);
    assert.equal((await accountRequest(admin, `/users/${actor._id}`, 'PUT', { ...accountDetails, password: '' })).status, 200);
    assert.equal((await User.findById(actor._id)).password, recovered.password, 'Blank password preserves existing password');
    assert.equal((await accountRequest(admin, `/users/${actor._id}`, 'PUT', { ...accountDetails, password: 'short' })).status, 400);
    assert.equal((await accountRequest(user, `/users/${actor._id}`, 'PUT', accountDetails)).status, 403);
    if (role === 'user') {
      assert.equal((await accountRequest(actor, '/ris/my-items')).status, 200);
      assert.equal((await accountRequest(actor, '/ris/my-returns')).status, 200);
      assert.equal((await accountRequest(actor, '/users', 'POST', { firstName: 'Denied' })).status, 403);
    }
  }

});
