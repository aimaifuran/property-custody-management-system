const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const RIS = require('../src/models/RequisitionIssueSlip');
const ICS = require('../src/models/InventoryCustodianSlip');
const Item = require('../src/models/Item');
const Inventory = require('../src/models/Inventory');
const Card = require('../src/models/PropertyCard');
const User = require('../src/models/User');
const issueRis = require('../src/utils/issueRis');
const { propertyCardHistory } = require('../src/utils/propertyCardHistory');

test('manual card issuance uses exact receipt, computes history, rejects overdraws and deduplicates retries', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  t.after(async () => { await mongoose.disconnect(); await database.stop(); });
  await Promise.all([RIS.init(), ICS.init()]);
  const admin = await User.create({ username: 'admin', firstName: 'Admin', lastName: 'Test', email: 'admin@example.test', password: 'test', division: 'Finance', office: 'Supply', role: 'admin' });
  const recipient = await User.create({ username: 'recipient', firstName: 'Recipient', lastName: 'Test', email: 'recipient@example.test', password: 'test', division: 'Finance', office: 'Treasury', role: 'user' });
  const stock = await Item.create({ stockNumber: 'LAPTOP', description: 'Laptop', cost: 60000, unit: 'unit', quantityOnHand: 10 });
  const inventory = await Inventory.create({ item: stock._id, quantity: 5, unitCost: 45000, propertyNumber: 'PROP-1' });
  await Inventory.create({ item: stock._id, quantity: 5, unitCost: 60000, propertyNumber: 'PROP-2' });
  const card = await Card.create({ entityName: 'LGU', fundCluster: 'General Fund', items: [{ inventory: inventory._id, receiptQuantity: 5, unitCost: 45000, amount: 225000, description: 'Laptop' }] });
  const router = require('../src/routes/propertyCards');
  const patch = router.stack.find(layer => layer.route?.path === '/:id/missing-field').route.stack.at(-1).handle;
  const complete = async body => {
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await patch({ params: { id: String(card._id) }, body, user: admin, get: () => 'test' }, response);
    return response;
  };
  assert.equal((await complete({ field: 'serialNumber', value: 'SN123' })).code, 200);
  assert.equal((await Card.findById(card._id)).serialNumber, 'SN123');
  assert.equal((await complete({ field: 'serialNumber', value: 'Changed' })).code, 409);
  assert.equal((await complete({ rowId: String(card.items[0]._id), field: 'remarks', value: 'Receipt checked' })).code, 200);
  assert.equal((await complete({ rowId: String(card.items[0]._id), field: 'balanceQuantity', value: '100' })).code, 400);
  assert.equal((await complete({ field: 'entityName', value: 'Forged entity' })).code, 400);
  const values = { cardId: String(card._id), rowId: String(card.items[0]._id), quantity: 2, recipient: { user: String(recipient._id) }, requestId: 'manual-request-0001' };
  const run = manualIssue => issueRis(null, admin, {}, { approve: true, manualIssue });
  const first = await run(values);
  const ics = await ICS.findOne({ ris: first.ris._id });
  assert.equal(ics.items[0].unitCost, 45000);
  assert.equal(ics.items[0].totalCost, 90000);
  assert.equal(ics.items[0].inventoryItemNo, 'PROP-1');
  assert.equal((await Item.findById(stock._id)).quantityOnHand, 8);
  const history = propertyCardHistory(await Card.findById(card._id));
  assert.equal(history.items.at(-1).balanceQuantity, 3);
  assert.equal(history.items.at(-1).amount, 90000);
  await run(values);
  assert.equal((await Item.findById(stock._id)).quantityOnHand, 8);
  assert.equal(await RIS.countDocuments(), 1);
  await assert.rejects(run({ ...values, requestId: 'manual-request-0002', quantity: 4 }), /remaining Property Card balance/);
  assert.equal(await RIS.countDocuments(), 1);
  const attempts = await Promise.allSettled([
    run({ ...values, requestId: 'manual-request-0003' }),
    run({ ...values, requestId: 'manual-request-0004' }),
  ]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(propertyCardHistory(await Card.findById(card._id)).items.at(-1).balanceQuantity, 1);
  assert.equal((await Item.findById(stock._id)).quantityOnHand, 6);
});
