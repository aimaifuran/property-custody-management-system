const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const Item = require('../src/models/Item');
const Inventory = require('../src/models/Inventory');
const IAR = require('../src/models/InspectionAcceptanceReport');
const RIS = require('../src/models/RequisitionIssueSlip');
const ICS = require('../src/models/InventoryCustodianSlip');
const PAR = require('../src/models/PropertyAcknowledgementReceipt');
const Accountability = require('../src/models/PropertyAccountability');
const PTR = require('../src/models/PropertyTransferReport');
const PRS = require('../src/models/PropertyReturnSlip');
const Card = require('../src/models/PropertyCard');
const Ledger = require('../src/models/LedgerTransaction');
const ReturnedSupply = require('../src/models/ReturnedSupply');
const Notification = require('../src/models/Notification');

test('stock receipt, mixed issuance, custodian acceptance, approved transfer and inspected returns', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  await Promise.all([IAR.init(), RIS.init(), ICS.init(), PAR.init(), PTR.init(), PRS.init(), Item.init()]);
  const server = require('../src/app').listen(0);
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await database.stop(); });
  const makeUser = (username, role = 'user') => User.create({ username, firstName: username, lastName: 'Test', email: `${username}@example.test`, password: 'test', office: 'Treasury', division: 'Finance', role, permissions: ['canViewRIS'] });
  const admin = await makeUser('admin', 'admin'); const sender = await makeUser('sender'); const receiver = await makeUser('receiver'); const outsider = await makeUser('outsider');
  const request = async (user, url, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, { method, headers: { Authorization: `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const received = { iarNumber: '001', entityName: 'Carigara', items: [
    { stockNumber: 'PAPER', description: 'Bond paper', unit: 'ream', quantity: 10, unitCost: 250, itemType: 'SUPPLY' },
    { stockNumber: 'CHAIR', description: 'Office chair', unit: 'piece', quantity: 2, unitCost: 1500, itemType: 'ASSET' },
    { stockNumber: 'LAPTOP', description: 'Laptop', unit: 'unit', quantity: 1, unitCost: 60000, itemType: 'ASSET' },
  ] };
  assert.equal((await request(sender, '/iar', received)).status, 403);
  const receipt = await request(admin, '/iar', received);
  assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
  assert.equal((await Item.findOne({ stockNumber: 'PAPER' })).quantityOnHand, 10);
  assert.equal(await Card.countDocuments({ iar: receipt.body.data._id }), 1);
  assert.equal((await request(admin, `/iar/${receipt.body.data._id}`, { ...received, items: received.items.map(item => ({ ...item, quantity: 100 })) }, 'PUT')).status, 409);
  const before = await Inventory.countDocuments();
  const badReceipt = await request(admin, '/iar', { ...received, iarNumber: '002', items: [received.items[0], { ...received.items[1], stockNumber: 'PAPER', itemType: 'ASSET' }] });
  assert.equal(badReceipt.status, 400);
  assert.equal(await IAR.countDocuments({ iarNumber: '002' }), 0);
  assert.equal(await Inventory.countDocuments(), before);
  assert.equal((await Item.findOne({ stockNumber: 'PAPER' })).quantityOnHand, 10);

  const submission = await request(sender, '/ris/my-requests', { purpose: 'Office operations', items: received.items.map(item => ({ stockNumber: item.stockNumber, quantityRequested: item.stockNumber === 'PAPER' ? 5 : item.quantity })) });
  assert.equal(submission.status, 201);
  const risId = submission.body.data._id;
  assert.equal((await request(sender, `/ris/${risId}/approve`, {})).status, 403);
  assert.equal((await request(admin, `/ris/${risId}/approve`, {})).status, 200);
  assert.equal((await Item.findOne({ stockNumber: 'PAPER' })).quantityOnHand, 5);
  const ris = await RIS.findById(risId);
  assert.deepEqual(ris.items.map(row => row.formType), ['SUPPLY', 'ICS', 'PAR']);
  assert.equal(ris.items[0].accountability, undefined);
  assert.equal(await Accountability.countDocuments({ ris: risId }), 2);
  assert.equal((await ICS.findOne({ ris: risId })).items.length, 1);
  assert.equal((await PAR.findOne({ ris: risId })).items.length, 1);
  assert.equal((await request(outsider, '/custody/assets')).body.data.length, 0);
  for (const path of ['/ics', '/par']) {
    assert.equal((await request(sender, path)).body.data.length, 1);
    assert.equal((await request(outsider, path)).body.data.length, 0);
  }
  const assets = (await request(sender, '/custody/assets')).body.data;
  const chair = assets.find(asset => asset.formType === 'ICS'); const laptop = assets.find(asset => asset.formType === 'PAR');
  assert.equal((await request(outsider, `/custody/forms/ICS/${chair.issuanceForm}`)).status, 404);
  assert.equal((await request(admin, `/ics/${chair.issuanceForm}`, { user: receiver._id }, 'PUT')).status, 409);
  const transfer = { accountability: laptop._id, toUser: receiver._id, reason: 'Office reassignment' };
  assert.equal((await request(sender, '/custody/transfers', transfer)).status, 400, 'Acceptance is required before transfer');
  assert.equal((await request(outsider, `/custody/forms/PAR/${laptop.issuanceForm}/accept`, {})).status, 404);
  for (const asset of assets) assert.equal((await request(sender, `/custody/forms/${asset.formType}/${asset.issuanceForm}/accept`, {})).status, 200);
  assert.ok((await Accountability.findById(laptop._id)).acceptedAt);
  const pending = await request(sender, '/custody/transfers', transfer);
  assert.equal(pending.status, 201, JSON.stringify(pending.body)); const ptrId = pending.body.data._id;
  assert.equal((await request(receiver, '/ptr')).body.data.length, 1);
  assert.equal((await request(outsider, '/ptr')).body.data.length, 0);
  assert.equal((await request(sender, '/custody/transfers', transfer)).status, 409);
  assert.equal((await request(admin, `/custody/transfers/${ptrId}/approve`, {})).status, 409);
  assert.equal((await request(outsider, `/custody/transfers/${ptrId}/receive`, {})).status, 404);
  assert.equal((await request(admin, `/ptr/${ptrId}`, { status: 'APPROVED' }, 'PUT')).status, 409);
  assert.equal((await request(receiver, `/custody/transfers/${ptrId}/receive`, {})).status, 200);
  assert.equal(String((await Accountability.findById(laptop._id)).user), String(sender._id));
  assert.equal((await request(admin, `/custody/transfers/${ptrId}/approve`, {})).status, 200);
  const annualYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()));
  const annual = (await request(admin, `/reports/annual-office-items?year=${annualYear}`)).body.data;
  const laptopRows = annual.groups.flatMap(group => group.rows).filter(row => row.stockNumber === 'LAPTOP');
  assert.equal(laptopRows.length, 1, 'Linked forms must not duplicate the issued asset');
  assert.equal(laptopRows[0].custodian, 'receiver Test');
  const chairStock = await Item.findOne({ stockNumber: 'CHAIR' });
  assert.equal((await request(admin, `/custody/stock/${chairStock._id}/classify`, { itemType: 'SUPPLY' })).status, 409);
  assert.equal((await request(admin, `/custody/transfers/${ptrId}/approve`, {})).status, 409);
  const reassigned = await Accountability.findById(laptop._id);
  assert.equal(String(reassigned.user), String(receiver._id));
  assert.notEqual(String(reassigned.issuanceForm), laptop.issuanceForm);
  assert.equal(reassigned.transferHistory.length, 1);
  assert.equal((await request(sender, '/custody/assets')).body.data.length, 1);
  assert.equal((await request(receiver, '/custody/assets')).body.data.length, 1);
  assert.equal((await request(sender, '/ris/my-returns')).body.data.some(row => row.stockNumber === 'LAPTOP'), false);
  assert.equal((await request(sender, '/ris/my-returns', { risId, itemId: String(ris.items[2]._id), quantity: 1 })).status, 400);
  assert.equal((await request(sender, '/custody/returns', { accountability: laptop._id, quantity: 1 })).status, 404);

  // Rejection retains custody and releases the movement lock.
  const rejectedTransfer = await request(sender, '/custody/transfers', { ...transfer, accountability: chair._id });
  assert.equal((await request(receiver, `/custody/transfers/${rejectedTransfer.body.data._id}/reject`, { reason: 'Not received' })).status, 200);
  assert.equal((await Accountability.findById(chair._id)).pendingMovement, undefined);
  assert.equal(String((await Accountability.findById(chair._id)).user), String(sender._id));

  // A serviceable partial return restores only the received quantity.
  const partial = await request(sender, '/custody/returns', { accountability: chair._id, quantity: 1, note: 'One spare chair' });
  assert.equal(partial.status, 201);
  assert.equal((await request(sender, '/prs')).body.data.length, 1);
  assert.equal((await request(outsider, '/prs')).body.data.length, 0);
  assert.equal((await Item.findOne({ stockNumber: 'CHAIR' })).quantityOnHand, 0);
  assert.equal((await request(sender, '/custody/returns', { accountability: chair._id, quantity: 1 })).status, 409);
  assert.equal((await request(receiver, `/prs/${partial.body.data._id}/confirm`, {})).status, 403);
  assert.equal((await request(admin, `/prs/${partial.body.data._id}/confirm`, { condition: 'Serviceable' })).status, 200);
  assert.equal((await Item.findOne({ stockNumber: 'CHAIR' })).quantityOnHand, 1);
  const remainingChair = await Accountability.findById(chair._id);
  assert.equal(remainingChair.active, true); assert.equal(remainingChair.returnedQuantity, 1);
  assert.equal((await request(admin, `/prs/${partial.body.data._id}/confirm`, {})).status, 404);
  assert.equal(await ReturnedSupply.countDocuments({ prs: partial.body.data._id }), 1);

  // Failure after stock writes rolls the whole receipt back.
  const final = await request(sender, '/custody/returns', { accountability: chair._id, quantity: 1 });
  const original = Ledger.create; Ledger.create = async () => { throw new Error('Simulated posting failure'); };
  try { assert.equal((await request(admin, `/prs/${final.body.data._id}/confirm`, {})).status, 400); }
  finally { Ledger.create = original; }
  assert.equal((await PRS.findById(final.body.data._id)).status, 'PENDING');
  assert.equal((await Item.findOne({ stockNumber: 'CHAIR' })).quantityOnHand, 1);
  assert.equal((await Accountability.findById(chair._id)).returnedQuantity, 1);
  assert.equal((await request(admin, `/prs/${final.body.data._id}/confirm`, {})).status, 200);
  assert.equal((await Item.findOne({ stockNumber: 'CHAIR' })).quantityOnHand, 2);
  assert.equal((await Accountability.findById(chair._id)).active, false);

  // The new custodian can return transferred property; unserviceable stock cannot be reissued.
  const broken = await request(receiver, '/custody/returns', { accountability: laptop._id, quantity: 1, note: 'Broken screen' });
  assert.equal(broken.status, 201);
  assert.equal((await request(admin, `/prs/${broken.body.data._id}/confirm`, { condition: 'Unserviceable' })).status, 200);
  assert.equal((await Accountability.findById(laptop._id)).active, false);
  assert.equal((await Item.findOne({ stockNumber: 'LAPTOP' })).quantityOnHand, 0);
  assert.equal((await Inventory.findById(reassigned.inventory)).status, 'RETURNED_UNSERVICEABLE');
  assert.equal((await request(receiver, '/custody/assets')).body.data.length, 0);
  assert.equal((await ReturnedSupply.findOne({ prs: broken.body.data._id })).condition, 'Unserviceable');
  assert.equal((await request(sender, '/custody/transfers')).body.data.length, 2);
  assert.equal((await request(outsider, '/custody/transfers')).body.data.length, 0);
  assert.equal((await request(outsider, '/custody/returns')).body.data.length, 0);
  assert.ok(await Notification.countDocuments({ user: admin._id, title: 'New supply/property request' }));
  const notification = await Notification.findOne({ user: sender._id });
  assert.equal((await request(outsider, `/custody/notifications/${notification._id}/read`, {})).status, 404);
  assert.equal((await request(sender, `/custody/notifications/${notification._id}/read`, {})).status, 200);

  // Serviceable returned property can be reissued; concurrent returns reserve it once.
  const reissue = await request(sender, '/ris/my-requests', { purpose: 'Reuse returned chair', items: [{ stockNumber: 'CHAIR', quantityRequested: 1 }] });
  assert.equal((await request(admin, `/ris/${reissue.body.data._id}/approve`, {})).status, 200);
  const reissuedAsset = (await request(sender, '/custody/assets')).body.data[0];
  assert.equal((await Item.findOne({ stockNumber: 'CHAIR' })).quantityOnHand, 1);
  const concurrentReturns = await Promise.all([request(sender, '/custody/returns', { accountability: reissuedAsset._id, quantity: 1 }), request(sender, '/custody/returns', { accountability: reissuedAsset._id, quantity: 1 })]);
  assert.deepEqual(concurrentReturns.map(result => result.status).sort(), [201, 409]);
  const pendingReturn = concurrentReturns.find(result => result.status === 201).body.data;
  assert.equal((await request(admin, `/prs/${pendingReturn._id}/reject`, { reason: 'Item remains in office' })).status, 200);
  assert.equal((await Accountability.findById(reissuedAsset._id)).pendingMovement, undefined);
  assert.equal((await Accountability.findById(reissuedAsset._id)).active, true);

  const refused = await request(sender, '/ris/my-requests', { purpose: 'Unavailable laptop', items: [{ stockNumber: 'LAPTOP', quantityRequested: 1 }] });
  assert.equal((await request(admin, `/ris/${refused.body.data._id}/approve`, {})).status, 400);
  assert.equal((await request(admin, `/ris/${refused.body.data._id}/reject`, { rejectionReason: 'No serviceable stock' })).status, 200);
  assert.equal((await request(admin, `/ris/${refused.body.data._id}/approve`, {})).status, 400);
  assert.equal((await RIS.findById(refused.body.data._id)).status, 'REJECTED');
  assert.equal((await Item.findOne({ stockNumber: 'LAPTOP' })).quantityOnHand, 0);

  // Linked Returned Supply receipts use the same PRS posting and available-stock rules.
  const paperReturn = await request(admin, '/returned-supply', { returnedBy: { user: sender._id }, description: 'Bond paper', mrNumber: ris.risNumber, quantity: 1, condition: 'Serviceable' });
  assert.equal(paperReturn.status, 201, JSON.stringify(paperReturn.body));
  assert.ok(paperReturn.body.data.prs);
  assert.equal((await Item.findOne({ stockNumber: 'PAPER' })).quantityOnHand, 6);
  const paper = await Item.findOne({ stockNumber: 'PAPER' });
  assert.equal((await request(sender, `/custody/stock/${paper._id}/classify`, { itemType: 'ASSET' })).status, 403);
  assert.equal((await request(admin, `/custody/stock/${paper._id}/classify`, { itemType: 'SUPPLY' })).status, 200);
  const suppliesOnly = await request(sender, '/ris/my-requests', { purpose: 'Paper only', items: [{ stockNumber: 'PAPER', quantityRequested: 1 }] });
  assert.equal((await request(admin, `/ris/${suppliesOnly.body.data._id}/approve`, {})).status, 200);
  assert.equal(await ICS.countDocuments({ ris: suppliesOnly.body.data._id }), 0);
  assert.equal(await PAR.countDocuments({ ris: suppliesOnly.body.data._id }), 0);
  assert.equal(await Accountability.countDocuments({ ris: suppliesOnly.body.data._id }), 0);
  assert.equal((await Item.findOne({ stockNumber: 'PAPER' })).quantityOnHand, 5);
});
