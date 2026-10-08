const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const IAR = require('../src/models/InspectionAcceptanceReport');
const Item = require('../src/models/Item');
const Inventory = require('../src/models/Inventory');
const Card = require('../src/models/PropertyCard');
const RIS = require('../src/models/RequisitionIssueSlip');
const Ledger = require('../src/models/LedgerTransaction');

// Mirrors the editor payload, including empty fields omitted by minimal API clients.
const completedForm = (number, stockNumber) => ({
  entityName: 'Municipality of Carigara',
  fundCluster: 'General Fund',
  supplierName: 'Office Supplies Supplier',
  poNumber: 'PO-2026-1001',
  poDate: '2026-10-08',
  responsibilityCenterCode: 'Supply Office',
  iarNumber: number,
  autoNumber: false,
  iarDate: '2026-10-08',
  invoiceNumber: 'INV-1001',
  invoiceDate: '',
  inspectionDate: '2026-10-08',
  inspectedBy: 'Inspection Committee',
  acceptanceDate: '2026-10-08',
  acceptanceStatus: 'Complete',
  acceptanceQuantity: '',
  custodian: 'Supply Officer',
  items: [{ itemType: 'SUPPLY', stockPropertyNumber: stockNumber, description: 'Bond paper', unit: 'ream', quantity: 5, unitCost: 250, totalCost: 1250, serialNumber: '', propertyNumber: '' }],
});

test('IAR editor payload saves stock atomically and reports field and number conflicts', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') },
  });
  await mongoose.connect(database.getUri());
  await Promise.all([IAR, Item, Inventory, Card, RIS, Ledger].map(Model => Model.init()));
  const server = require('../src/app').listen(0);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await database.stop();
  });
  const admin = await User.create({ username: 'iar-save-admin', firstName: 'Supply', lastName: 'Officer', email: 'iar-save-admin@example.test', password: 'test', role: 'admin', office: 'Supply', division: 'General Services' });
  const request = async (body, url = '/iar', method = 'POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
      method,
      headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  let saved;
  await t.test('complete acceptance allows blank optional dates and quantity and preserves an entered IAR number', async () => {
    const response = await request(completedForm('1001', 'IAR-SAVE-PAPER'));
    assert.equal(response.status, 201, JSON.stringify(response.body));
    saved = response.body.data;
    assert.equal(saved.iarNumber, '1001');
    assert.equal(saved.acceptanceQuantity, null);
    assert.equal(saved.invoiceDate, null);
    assert.equal(saved.status, 'LOGGED_TO_STOCKS');
    const stock = await Item.findOne({ stockNumber: 'IAR-SAVE-PAPER' });
    assert.equal(stock.quantityOnHand, 5);
    assert.equal(await Inventory.countDocuments({ inspectionAcceptanceReport: saved._id }), 1);
    assert.equal(await Card.countDocuments({ iar: saved._id }), 1);
    assert.equal(await RIS.countDocuments({ iar: saved._id }), 1);
    assert.equal(await Ledger.countDocuments({ reference: saved.iarNumber, type: 'incoming' }), 1);
    const updated = await request(completedForm(saved.iarNumber, 'IAR-SAVE-PAPER'), `/iar/${saved._id}`, 'PUT');
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal((await Item.findById(stock._id)).quantityOnHand, 5, 'Editing a receipt must not post stock twice');
  });

  await t.test('an unused optional cost becomes zero when the official form omits it', async () => {
    const payload = completedForm('1002', 'IAR-SAVE-NO-COST');
    payload.items[0].unitCost = '';
    const response = await request(payload);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data.items[0].unitCost, 0);
    assert.equal((await Inventory.findOne({ inspectionAcceptanceReport: response.body.data._id })).unitCost, 0);
  });

  await t.test('omitted IAR classification and cost retain existing supply and asset stock metadata', async () => {
    await Item.create({ stockNumber: 'IAR-SAVE-LAPTOP', description: 'Laptop', unit: 'piece', itemType: 'ASSET', cost: 60000 });
    const payload = completedForm('1003', 'IAR-SAVE-PAPER');
    payload.items = [
      { stockPropertyNumber: 'IAR-SAVE-PAPER', description: 'Bond paper', unit: 'ream', quantity: 3 },
      { stockPropertyNumber: 'IAR-SAVE-LAPTOP', description: 'Laptop', unit: 'piece', quantity: 1 },
    ];
    const response = await request(payload);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.deepEqual(response.body.data.items.map(row => [row.itemType, row.unitCost, row.totalCost]), [
      ['SUPPLY', 250, 750], ['ASSET', 60000, 60000],
    ]);
    const paper = await Item.findOne({ stockNumber: 'IAR-SAVE-PAPER' });
    assert.equal(paper.itemType, 'SUPPLY', 'A receipt must not reclassify an existing supply when classification is hidden');
    assert.equal(paper.cost, 250);
    assert.equal(paper.quantityOnHand, 8);
    const inventories = await Inventory.find({ inspectionAcceptanceReport: response.body.data._id }).sort({ unitCost: 1 });
    assert.deepEqual(inventories.map(row => [row.unitCost, row.assetCost]), [[250, 750], [60000, 60000]]);
    const card = await Card.findOne({ iar: response.body.data._id });
    assert.deepEqual(card.items.map(row => row.amount), [750, 60000]);
  });

  await t.test('explicit legacy classification and zero cost still override existing stock defaults', async () => {
    await Item.create({ stockNumber: 'IAR-SAVE-EXPLICIT', description: 'Existing stock', unit: 'piece', itemType: 'SUPPLY', cost: 400 });
    const payload = completedForm('1004', 'IAR-SAVE-EXPLICIT');
    Object.assign(payload.items[0], { itemType: 'ASSET', unitCost: 0 });
    const response = await request(payload);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data.items[0].itemType, 'ASSET');
    assert.equal(response.body.data.items[0].unitCost, 0);
    assert.equal((await Item.findOne({ stockNumber: 'IAR-SAVE-EXPLICIT' })).itemType, 'ASSET');
    assert.equal((await Inventory.findOne({ inspectionAcceptanceReport: response.body.data._id })).unitCost, 0);
  });

  await t.test('genuinely new stock retains asset and zero cost defaults when the hidden fields are omitted', async () => {
    const payload = completedForm('1005', 'IAR-SAVE-NEW-DEFAULTS');
    delete payload.items[0].itemType;
    delete payload.items[0].unitCost;
    const response = await request(payload);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data.items[0].itemType, 'ASSET');
    assert.equal(response.body.data.items[0].unitCost, 0);
    const inventory = await Inventory.findOne({ inspectionAcceptanceReport: response.body.data._id });
    assert.equal(inventory.unitCost, 0);
    assert.equal(inventory.assetCost, 0);
  });

  await t.test('duplicate entered numbers return a useful conflict without adding stock or related records', async () => {
    const before = await Promise.all([IAR, Inventory, Card, RIS, Ledger].map(Model => Model.countDocuments()));
    const response = await request(completedForm(saved.iarNumber, 'IAR-SAVE-DUPLICATE'));
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.match(response.body.message, /IAR number already exists/i);
    assert.deepEqual(await Promise.all([IAR, Inventory, Card, RIS, Ledger].map(Model => Model.countDocuments())), before);
    assert.equal(await Item.countDocuments({ stockNumber: 'IAR-SAVE-DUPLICATE' }), 0);
    const second = await IAR.findOne({ iarNumber: '1002' });
    const update = await request({ iarNumber: saved.iarNumber }, `/iar/${second._id}`, 'PUT');
    assert.equal(update.status, 409, JSON.stringify(update.body));
    assert.equal((await IAR.findById(second._id)).iarNumber, '1002');
  });

  await t.test('invalid quantities are rejected before stock posting and identify the row', async () => {
    const payload = completedForm('1006', 'IAR-SAVE-INVALID');
    payload.items[0].quantity = 0;
    const response = await request(payload);
    assert.equal(response.status, 400);
    assert.match(response.body.message, /Item 1.*quantity/i);
    assert.equal(await IAR.countDocuments({ iarNumber: payload.iarNumber }), 0);
    assert.equal(await Item.countDocuments({ stockNumber: payload.items[0].stockPropertyNumber }), 0);
  });

  await t.test('partial acceptance also saves the entered acceptance quantity', async () => {
    const payload = completedForm('1007', 'IAR-SAVE-PARTIAL');
    payload.acceptanceStatus = 'Partial';
    payload.acceptanceQuantity = 3;
    payload.items[0].quantity = 3;
    const response = await request(payload);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data.acceptanceQuantity, 3);
    assert.equal((await Item.findOne({ stockNumber: 'IAR-SAVE-PARTIAL' })).quantityOnHand, 3);
  });
});
