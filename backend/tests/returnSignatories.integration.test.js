const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const Item = require('../src/models/Item');
const Inventory = require('../src/models/Inventory');
const Accountability = require('../src/models/PropertyAccountability');
const PRS = require('../src/models/PropertyReturnSlip');
const ReturnedSupply = require('../src/models/ReturnedSupply');
const Ledger = require('../src/models/LedgerTransaction');

test('editable PRS receiving signatories preserve receipt movements and custodian identity', { timeout: 60000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  await Promise.all([PRS.init(), Item.init()]);
  const app = express();
  app.use(express.json());
  app.use('/prs', require('../src/routes/returns'));
  const server = app.listen(0);
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await database.stop(); });
  const makeUser = (username, role) => User.create({ username, firstName: username, lastName: 'Test', email: `${username}@example.test`, password: 'test', office: 'Supply Office', division: 'Supply', role, permissions: ['canViewRIS'] });
  const admin = await makeUser('admin', 'admin');
  const custodian = await makeUser('custodian', 'user');
  const request = async (person, id, action, body, method = 'POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/prs/${id}${action ? `/${action}` : ''}`, { method, headers: { Authorization: `Bearer ${jwt.sign({ id: person._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  let sequence = 0;
  const pendingReturn = async () => {
    const stock = await Item.create({ stockNumber: `SIGN-${++sequence}`, description: 'Chair', unit: 'piece', cost: 100, quantityOnHand: 0 });
    const inventory = await Inventory.create({ item: stock._id, quantity: 1, unitCost: 100, assetCost: 100, status: 'ACTIVE_IN_USE' });
    const row = await Accountability.create({ inventory: inventory._id, user: custodian._id, quantity: 1, employee: 'custodian Test', office: custodian.office, issueDate: new Date(), formType: 'ICS', documentNumber: `ICS-${sequence}` });
    const slip = await PRS.create({ prsNumber: `PRS-SIGN-${sequence}`, submittedBy: custodian._id, status: 'PENDING', returnedBy: { user: custodian._id, name: 'custodian Test', designation: custodian.office }, items: [{ accountability: row._id, quantity: 1, description: 'Chair', unit: 'piece', unitValue: 100, totalValue: 100 }] });
    row.pendingMovement = `PRS:${slip._id}`;
    await row.save();
    return { stock, inventory, row, slip };
  };
  const signatory = { name: 'Receiving Officer', designation: 'Property Officer', date: '2026-10-08' };

  await t.test('admin confirmation persists the form signatory in PRS and returned supply', async () => {
    const { slip, stock, row } = await pendingReturn();
    assert.equal((await request(custodian, slip._id, 'confirm', { returnedTo: signatory })).status, 403);
    const received = await request(admin, slip._id, 'confirm', { returnedTo: { ...signatory, user: admin._id }, returnedBy: { user: admin._id } });
    assert.equal(received.status, 200, JSON.stringify(received.body));
    assert.equal(received.body.data.returnedTo.name, signatory.name);
    assert.equal(received.body.data.returnedTo.designation, signatory.designation);
    assert.equal(received.body.data.returnedTo.date, '2026-10-08T00:00:00.000Z');
    assert.equal(received.body.data.returnedTo.user, undefined);
    assert.equal(received.body.data.returnedBy.user, String(custodian._id));
    const supply = await ReturnedSupply.findOne({ prs: slip._id });
    assert.equal(supply.returnedTo.name, signatory.name);
    assert.equal(supply.returnedTo.designation, signatory.designation);
    assert.equal(supply.returnedTo.date.toISOString(), '2026-10-08T00:00:00.000Z');
    assert.equal((await Item.findById(stock._id)).quantityOnHand, 1);
    assert.equal((await Accountability.findById(row._id)).active, false);
    assert.equal((await request(admin, slip._id, 'confirm', { returnedTo: signatory })).status, 404);
  });

  await t.test('completed user returns allow signatory corrections without reposting', async () => {
    const { slip, stock, inventory, row } = await pendingReturn();
    assert.equal((await request(admin, slip._id, '', { returnedTo: signatory }, 'PUT')).status, 400, 'Pending workflow returns must still be confirmed');
    assert.equal((await request(admin, slip._id, 'confirm', { returnedTo: signatory })).status, 200);
    const correction = { name: 'Corrected Officer', designation: 'Supply Officer', date: '2026-10-09' };
    assert.equal((await request(custodian, slip._id, '', { returnedTo: correction }, 'PUT')).status, 403);
    const ledgerBefore = await Ledger.countDocuments({ inventory: inventory._id });
    const updated = await request(admin, slip._id, '', { returnedTo: correction }, 'PUT');
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.returnedTo.name, correction.name);
    assert.equal(updated.body.data.returnedTo.designation, correction.designation);
    assert.equal(updated.body.data.returnedTo.date, '2026-10-09T00:00:00.000Z');
    assert.equal(updated.body.data.returnedBy.user, String(custodian._id));
    assert.equal(updated.body.data.status, 'RETURNED');
    const supply = await ReturnedSupply.findOne({ prs: slip._id });
    assert.equal(supply.returnedTo.name, correction.name);
    assert.equal(supply.returnedTo.date.toISOString(), '2026-10-09T00:00:00.000Z');
    assert.equal(await ReturnedSupply.countDocuments({ prs: slip._id }), 1);
    assert.equal((await Item.findById(stock._id)).quantityOnHand, 1);
    assert.equal((await Accountability.findById(row._id)).returnedQuantity, 1);
    assert.equal(await Ledger.countDocuments({ inventory: inventory._id }), ledgerBefore);
    assert.equal((await request(admin, slip._id, '', { items: [{ ...updated.body.data.items[0], quantity: 2 }] }, 'PUT')).status, 409);
    assert.equal((await request(admin, slip._id, '', { returnedBy: { user: admin._id } }, 'PUT')).status, 409);
    const partialCorrection = await request(admin, slip._id, '', { returnedTo: { name: 'Second Correction' } }, 'PUT');
    assert.equal(partialCorrection.status, 200);
    assert.equal(partialCorrection.body.data.returnedTo.designation, correction.designation);
    assert.equal(partialCorrection.body.data.returnedTo.date, '2026-10-09T00:00:00.000Z');
  });

  await t.test('omitted signatories use acting admin defaults; explicitly blank fields remain editable', async () => {
    const { slip } = await pendingReturn();
    const received = await request(admin, slip._id, 'confirm', {});
    assert.equal(received.status, 200);
    assert.equal(received.body.data.returnedTo.name, 'admin Test');
    assert.equal(received.body.data.returnedTo.designation, admin.office);
    assert.ok(received.body.data.returnedTo.date);
    const cleared = await request(admin, slip._id, '', { returnedTo: { name: '', designation: '', date: '' } }, 'PUT');
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body.data.returnedTo, { name: '', designation: '', date: null });
  });

  await t.test('invalid signatories and failed supply synchronization roll back safely', async () => {
    const { slip, stock, row } = await pendingReturn();
    const invalid = await request(admin, slip._id, 'confirm', { returnedTo: { ...signatory, date: 'not-a-date' } });
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.message, /Returned To date/);
    assert.equal((await PRS.findById(slip._id)).status, 'PENDING');
    assert.equal((await Item.findById(stock._id)).quantityOnHand, 0);
    assert.equal((await Accountability.findById(row._id)).returnedQuantity, 0);
    assert.equal(await ReturnedSupply.countDocuments({ prs: slip._id }), 0);
    assert.equal((await request(admin, slip._id, 'confirm', { returnedTo: signatory })).status, 200);
    assert.equal((await request(admin, slip._id, '', { returnedTo: { date: 'invalid' } }, 'PUT')).status, 400);
    const originalUpdateMany = ReturnedSupply.updateMany;
    ReturnedSupply.updateMany = async () => { throw new Error('Simulated supply correction failure'); };
    try { assert.equal((await request(admin, slip._id, '', { returnedTo: { name: 'Must roll back' } }, 'PUT')).status, 400); }
    finally { ReturnedSupply.updateMany = originalUpdateMany; }
    assert.equal((await PRS.findById(slip._id)).returnedTo.name, signatory.name);
    assert.equal((await ReturnedSupply.findOne({ prs: slip._id })).returnedTo.name, signatory.name);
    assert.equal((await Item.findById(stock._id)).quantityOnHand, 1);
    assert.equal((await Accountability.findById(row._id)).returnedQuantity, 1);
  });
});
