const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const RIS = require('../src/models/RequisitionIssueSlip');
const ICS = require('../src/models/InventoryCustodianSlip');
const PAR = require('../src/models/PropertyAcknowledgementReceipt');
const Item = require('../src/models/Item');
const Inventory = require('../src/models/Inventory');
const User = require('../src/models/User');
const Accountability = require('../src/models/PropertyAccountability');
const Card = require('../src/models/PropertyCard');
const Ledger = require('../src/models/LedgerTransaction');
const issueRis = require('../src/utils/issueRis');

test('RIS issuance generates linked forms by unit cost for the requester and rolls back failures', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  t.after(async () => { await mongoose.disconnect(); await database.stop(); });
  await Promise.all([RIS.init(), ICS.init(), PAR.init()]);
  const makeUser = (username, role = 'user') => User.create({ username, firstName: username, lastName: 'Test', email: `${username}@example.test`, password: 'test', office: 'Treasury', division: 'Finance', role });
  const user = await makeUser('requester'); const other = await makeUser('receiver'); const admin = await makeUser('admin', 'admin');
  const rows = [];
  for (const [stockNumber, cost, quantity] of [['BELOW', 30000, 2], ['EXACT', 50000, 1], ['ABOVE', 75000, 1]]) {
    const item = await Item.create({ stockNumber, description: stockNumber, cost, unit: 'unit', quantityOnHand: 5 });
    const inventory = await Inventory.create({ item: item._id, quantity: 5, unitCost: cost, propertyNumber: stockNumber });
    await Card.create({ items: [{ inventory: inventory._id, receiptQuantity: 5, balanceQuantity: 5 }] });
    rows.push({ stockNumber, description: stockNumber, quantityRequested: quantity, quantityIssued: quantity });
  }
  const createRis = number => RIS.create({ risNumber: number, entityName: 'Carigara', fundCluster: 'Trust Fund', office: 'Treasury', status: 'APPROVED', requestedBy: { user: user._id, name: 'requester Test' }, receivedBy: { user: other._id, name: 'receiver Test' }, items: rows });
  const ris = await createRis('REQUEST-1');
  const result = await issueRis(ris._id, admin);
  const ics = await ICS.findOne({ ris: ris._id }); const par = await PAR.findOne({ ris: ris._id });
  assert.equal(ics.items.length, 1); assert.equal(ics.items[0].totalCost, 60000);
  assert.equal(par.items.length, 2); assert.equal(par.items[0].amount, 50000);
  assert.equal(String(ics.user), String(user._id)); assert.equal(String(par.user), String(user._id));
  assert.equal(ics.receivedBy.name, 'requester Test'); assert.equal(par.receivedBy.name, 'requester Test');
  assert.match(ics.icsNumber, /^\d{4}-\d{2}-\d{3}$/);
  assert.equal(String(result.ris.receivedBy.user), String(user._id));
  assert.equal(String(result.ris.inventoryCustodianSlip), String(ics._id));
  assert.equal(String(result.ris.propertyAcknowledgementReceipt), String(par._id));
  assert.deepEqual(result.ris.items.map(row => row.formType), ['ICS', 'PAR', 'PAR']);
  assert.equal(await Accountability.countDocuments({ user: user._id, ris: ris._id }), 3);
  assert.equal(await Accountability.countDocuments({ user: other._id }), 0);
  assert.equal((await Item.findOne({ stockNumber: 'BELOW' })).quantityOnHand, 3);
  const card = await Card.findOne({ 'items.propertyNumber': 'BELOW' });
  assert.equal(card.items.at(-1).referenceParNo, ics.icsNumber);
  assert.equal(card.items.at(-1).balanceQuantity, 3);
  await assert.rejects(issueRis(ris._id, admin), /approved before issuance/);
  assert.equal(await ICS.countDocuments({ ris: ris._id }), 1);
  // Failure after stock/form/accountability writes must leave no partial issuance.
  const failing = await createRis('REQUEST-2');
  const createLedger = Ledger.create;
  Ledger.create = async () => { throw new Error('Simulated ledger failure'); };
  try { await assert.rejects(issueRis(failing._id, admin), /Simulated ledger failure/); }
  finally { Ledger.create = createLedger; }
  assert.equal((await RIS.findById(failing._id)).status, 'APPROVED');
  assert.equal(await ICS.countDocuments({ ris: failing._id }), 0);
  assert.equal(await Accountability.countDocuments({ ris: failing._id }), 0);
  assert.equal((await Item.findOne({ stockNumber: 'BELOW' })).quantityOnHand, 3);
  const attempts = await Promise.allSettled([issueRis(failing._id, admin), issueRis(failing._id, admin)]);
  assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 1);
  assert.equal(await ICS.countDocuments({ ris: failing._id }), 1);
  const unavailable = await RIS.create({ risNumber: 'UNAVAILABLE', status: 'PENDING_REVIEW', office: 'Treasury', requestedBy: { user: user._id, name: 'requester Test' }, items: rows.map(row => ({ ...row, quantityIssued: 0 })) });
  await assert.rejects(issueRis(unavailable._id, admin, {}, { approve: true }), /Insufficient stock/);
  assert.equal((await RIS.findById(unavailable._id)).status, 'PENDING_REVIEW');
  assert.equal(await ICS.countDocuments({ ris: unavailable._id }), 0);
});
