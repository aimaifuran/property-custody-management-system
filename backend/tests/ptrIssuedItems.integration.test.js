const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const Item = require('../src/models/Item');
const Inventory = require('../src/models/Inventory');
const Accountability = require('../src/models/PropertyAccountability');
const Notification = require('../src/models/Notification');
const PTR = require('../src/models/PropertyTransferReport');
const PropertyReturnSlip = require('../src/models/PropertyReturnSlip');
const PAR = require('../src/models/PropertyAcknowledgementReceipt');
const DocumentSequence = require('../src/models/DocumentSequence');
const RIS = require('../src/models/RequisitionIssueSlip');
const { annualOfficeItems } = require('../src/utils/annualOfficeItems');

test('admin PTR records can only include issued and accepted user accountabilities', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') },
  });
  await mongoose.connect(database.getUri());
  await Promise.all([PTR.init(), Item.init(), PAR.init(), DocumentSequence.init()]);
  const server = require('../src/app').listen(0);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await database.stop();
  });

  const admin = await User.create({
    username: 'ptr-admin',
    firstName: 'PTR',
    lastName: 'Admin',
    email: 'ptr-admin@example.test',
    password: 'test',
    role: 'admin',
    office: 'Supply',
    division: 'General Services',
  });
  const holder = await User.create({
    username: 'ptr-holder',
    firstName: 'Current',
    lastName: 'Holder',
    email: 'ptr-holder@example.test',
    password: 'test',
    role: 'user',
    office: 'Treasury',
    division: 'Finance',
  });
  const receiver = await User.create({
    username: 'ptr-receiver',
    firstName: 'New',
    lastName: 'Custodian',
    email: 'ptr-receiver@example.test',
    password: 'test',
    role: 'user',
    office: 'Records',
    division: 'Finance',
  });
  const item = await Item.create({ name: 'Laptop', stockNumber: 'PTR-ITEM', unit: 'unit', description: 'Issued laptop', cost: 1000 });
  const inventory = await Inventory.create({ item: item._id, quantity: 1, unitCost: 1000, assetCost: 1000, propertyNumber: 'PROP-001', purchaseDate: '2026-10-01' });
  const ris = await RIS.create({
    risNumber: '2026-10-RIS-001',
    status: 'ISSUED',
    issuedAt: '2026-10-02',
    office: holder.office,
    receivedBy: { name: 'Current Holder', date: '2026-10-02' },
    items: [{ inventory: inventory._id, stockNumber: item.stockNumber, description: item.description, quantityIssued: 1 }],
  });
  const accountability = await Accountability.create({
    inventory: inventory._id,
    user: holder._id,
    ris: ris._id,
    risItem: ris.items[0]._id,
    quantity: 1,
    employee: 'Current Holder',
    office: holder.office,
    issueDate: '2026-10-02',
    formType: 'PAR',
    documentNumber: 'PAR-001',
    propertyNumber: 'PROP-001',
  });
  const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'dev-secret');
  const request = async body => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ptr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const requestRoute = async (path, body, method = 'GET', actor = admin) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${jwt.sign({ id: actor._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const payload = {
    autoNumber: true,
    fundCluster: 'General Fund',
    fromAccountableOfficer: 'Forged owner',
    toAccountableOfficer: 'Receiving User',
    date: '2026-10-08',
    transferType: 'Reassignment',
    reasonForTransfer: 'Office reassignment',
    approvedBy: { name: 'Approver', designation: 'Manager', date: '2026-10-08' },
    issuedBy: { name: 'Issuer', designation: 'Custodian', date: '2026-10-08' },
    receivedBy: { name: 'Receiver', designation: 'Staff', date: '2026-10-08' },
  };
  const itemRow = { dateAcquired: '2026-10-05', propertyNumber: 'FORGED', description: 'Unissued asset', amount: 1, condition: 'Serviceable' };

  const unlinked = await request({ ...payload, items: [itemRow] });
  assert.equal(unlinked.status, 400);
  assert.equal(await PTR.countDocuments(), 0);

  const unaccepted = await request({ ...payload, items: [{ ...itemRow, accountability: accountability._id }] });
  assert.equal(unaccepted.status, 400);
  assert.equal(await PTR.countDocuments(), 0);

  accountability.acceptedAt = new Date('2026-10-03');
  await accountability.save();
  const missingRecipient = await request({ ...payload, items: [{ ...itemRow, accountability: accountability._id }] });
  assert.equal(missingRecipient.status, 400);
  assert.equal(await PTR.countDocuments(), 0);

  const sameRecipient = await request({ ...payload, toUser: holder._id, items: [{ ...itemRow, accountability: accountability._id }] });
  assert.equal(sameRecipient.status, 400);
  assert.equal(await PTR.countDocuments(), 0);

  const issued = await request({ ...payload, toUser: receiver._id, items: [{ ...itemRow, accountability: accountability._id }] });
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  assert.equal(issued.body.data.fromAccountableOfficer, 'Current Holder');
  assert.equal(String(issued.body.data.fromUser), String(holder._id));
  assert.equal(issued.body.data.toAccountableOfficer, 'New Custodian');
  assert.equal(String(issued.body.data.toUser), String(receiver._id));
  assert.equal(issued.body.data.items[0].quantity, 1);
  const notices = await Notification.find({ title: 'PTR recorded' }).lean();
  assert.deepEqual(notices.map(row => String(row.user)).sort(), [admin, holder, receiver].map(row => String(row._id)).sort());
  assert.ok(notices.every(row => row.body.includes(issued.body.data.ptrNumber)));
  assert.equal(issued.body.data.items[0].itemName, 'Laptop');
  assert.equal(new Date(issued.body.data.items[0].dateAcquired).toISOString().slice(0, 10), '2026-10-05');
  assert.equal(issued.body.data.items[0].description, 'Issued laptop');
  assert.equal(issued.body.data.items[0].propertyNumber, 'PROP-001');
  assert.equal(String(issued.body.data.items[0].accountability), String(accountability._id));
  const savedReports = await requestRoute('/ptr');
  assert.equal(savedReports.status, 200);
  assert.equal(savedReports.body.data[0].items[0].inventory.item.name, 'Laptop');
  const reassigned = await Accountability.findById(accountability._id);
  assert.equal(String(reassigned.user), String(receiver._id));
  assert.equal(reassigned.employee, 'New Custodian');
  assert.equal(reassigned.transferHistory.length, 1);
  assert.equal(String(reassigned.transferHistory[0].from), String(holder._id));
  assert.equal(String(reassigned.transferHistory[0].to), String(receiver._id));
  const nextIssue = await PAR.findById(reassigned.issuanceForm);
  assert.equal(String(nextIssue.user), String(receiver._id));
  assert.equal(nextIssue.items[0].propertyNumber, 'PROP-001');
  assert.equal(await Accountability.countDocuments({ user: holder._id, active: true }), 0);
  assert.equal(await Accountability.countDocuments({ user: receiver._id, active: true }), 1);
  const annualReport = await annualOfficeItems(2026);
  const annualItem = annualReport.groups.flatMap(group => group.rows).find(row => row.stockNumber === item.stockNumber);
  assert.equal(annualItem.custodian, 'New Custodian');

  accountability.active = false;
  accountability.returnedQuantity = 1;
  await accountability.save();
  const returnSlip = await PropertyReturnSlip.create({
    prsNumber: '2026-10-PRS-001',
    lguName: 'LGU Carigara',
    status: 'RETURNED',
    stockPosted: true,
    returnedBy: { user: holder._id, name: 'Current Holder', designation: holder.office },
    items: [{
      accountability: accountability._id,
      condition: 'Serviceable',
      quantity: 1,
      unit: 'unit',
      description: 'Returned laptop',
      propertyNumber: 'PROP-001',
      mrNumber: 'PAR-001',
      unitValue: 1000,
      totalValue: 1000,
    }],
  });
  await Item.updateOne({ _id: item._id }, { $set: { quantityOnHand: 1 } });
  await Accountability.updateOne({ _id: accountability._id }, { $set: { active: true } });
  const assignedDrafts = await requestRoute('/ptr/return-item-drafts');
  assert.equal(assignedDrafts.body.data.length, 0, 'Already-assigned assets are excluded from PRS drafts');
  await Accountability.updateOne({ _id: accountability._id }, { $set: { active: false } });
  const drafts = await requestRoute('/ptr/return-item-drafts');
  assert.equal(drafts.status, 200, JSON.stringify(drafts.body));
  assert.equal(drafts.body.data.length, 1);
  assert.equal(drafts.body.data[0].fromAccountableOfficer, 'Current Holder');
  assert.equal(drafts.body.data[0].item.description, 'Returned laptop');

  const returnItem = returnSlip.items[0];
  await Item.updateOne({ _id: item._id }, { $set: { quantityOnHand: 1 } });
  const inventoryBeforePtr = await Inventory.findById(inventory._id).lean();
  const accountabilityBeforePtr = await Accountability.findById(accountability._id).lean();
  const returnDraftPtr = await request({
    ...payload,
    toUser: receiver._id,
    items: [{
      returnSlip: returnSlip._id,
      returnSlipItem: returnItem._id,
      dateAcquired: '2026-10-01',
      propertyNumber: 'PROP-001',
      description: 'Returned laptop',
      quantity: 1,
      amount: 1000,
      condition: 'Serviceable',
    }],
  });
  assert.equal(returnDraftPtr.status, 201, JSON.stringify(returnDraftPtr.body));
  assert.equal(returnDraftPtr.body.data.fromAccountableOfficer, 'Current Holder');
  assert.equal(returnDraftPtr.body.data.toAccountableOfficer, 'New Custodian');
  assert.equal(String(returnDraftPtr.body.data.toUser), String(receiver._id));
  assert.equal(String(returnDraftPtr.body.data.fromUser), String(holder._id));
  const holderHistory = await requestRoute(`/users/${holder._id}/records`);
  assert.ok(holderHistory.body.data.transferRecords.some(row => row._id === returnDraftPtr.body.data._id && row.direction === "OUTGOING"));
  const inventoryAfterPtr = await Inventory.findById(inventory._id).lean();
  const accountabilityAfterPtr = await Accountability.findById(accountability._id).lean();
  assert.equal(inventoryAfterPtr.quantity, inventoryBeforePtr.quantity);
  assert.equal(inventoryAfterPtr.status, inventoryBeforePtr.status);
  assert.equal(accountabilityAfterPtr.active, accountabilityBeforePtr.active);
  assert.equal(accountabilityAfterPtr.returnedQuantity, accountabilityBeforePtr.returnedQuantity);
  assert.equal(String(accountabilityAfterPtr.user), String(accountabilityBeforePtr.user));
  const transferredId = returnDraftPtr.body.data.items[0].accountability;
  assert.ok(transferredId, 'PRS-based transfer creates live custody');
  const transferredAsset = await Accountability.findById(transferredId);
  assert.equal(String(transferredAsset.user), String(receiver._id));
  assert.equal(transferredAsset.returnedQuantity, 0);
  assert.equal((await Item.findById(item._id)).quantityOnHand, 0);
  const reconcile = await requestRoute('/custody/transfers/reconcile', {}, 'POST', receiver);
  assert.equal(reconcile.status, 200);
  assert.deepEqual(reconcile.body.data.errors, []);
  assert.equal((await Item.findById(item._id)).quantityOnHand, 0, 'repair never deducts stock twice');
  const userReturn = await requestRoute('/custody/returns', { accountability: transferredId, quantity: 1 }, 'POST', receiver);
  assert.equal(userReturn.status, 201, JSON.stringify(userReturn.body));
  assert.equal((await requestRoute('/custody/returns', { accountability: transferredId, quantity: 1 }, 'POST', holder)).status, 404);
  const rejectedReturn = await requestRoute(`/prs/${userReturn.body.data._id}/reject`, { reason: 'Test direct admin receipt instead' }, 'POST');
  assert.equal(rejectedReturn.status, 200);
  const adminReturn = await requestRoute(`/users/${receiver._id}/records/returned`, { accountability: transferredId, quantity: 1, condition: 'Serviceable', expectedRemaining: 1 }, 'POST');
  assert.equal(adminReturn.status, 201, JSON.stringify(adminReturn.body));
  assert.equal((await Item.findById(item._id)).quantityOnHand, 1);
  assert.equal((await Accountability.findById(transferredId)).active, false);
  const duplicateReturn = await requestRoute(`/users/${receiver._id}/records/returned`, { accountability: transferredId, quantity: 1, condition: 'Serviceable' }, 'POST');
  assert.equal(duplicateReturn.status, 409);
  assert.equal((await Item.findById(item._id)).quantityOnHand, 1);
  const legacyReport = await PTR.create({
    ptrNumber: 'LEGACY-RETURN-TRANSFER', status: 'RECORDED', toUser: holder._id, fromUser: receiver._id,
    fromAccountableOfficer: 'New Custodian', toAccountableOfficer: 'Current Holder', date: '2026-10-10',
    items: [{ returnSlip: adminReturn.body.data._id, returnSlipItem: adminReturn.body.data.items[0]._id,
      inventory: inventory._id, quantity: 1, description: 'Issued laptop', propertyNumber: 'PROP-001' }],
  });
  await requestRoute('/custody/transfers/reconcile', { userId: holder._id }, 'POST', receiver);
  assert.equal((await PTR.findById(legacyReport._id)).items[0].accountability, undefined, 'users cannot repair another account');
  const repaired = await requestRoute('/custody/transfers/reconcile', {}, 'POST', holder);
  assert.deepEqual(repaired.body.data.errors, []);
  const legacyAssetId = (await PTR.findById(legacyReport._id)).items[0].accountability;
  assert.ok(legacyAssetId, 'legacy PTR is repaired into actionable custody');
  await requestRoute('/custody/transfers/reconcile', {}, 'POST', holder);
  assert.equal(await Accountability.countDocuments({ transferSource: `PTR:${legacyReport._id}:${legacyReport.items[0]._id}` }), 1);
  const legacyReturn = await requestRoute('/custody/returns', { accountability: legacyAssetId, quantity: 1 }, 'POST', holder);
  assert.equal(legacyReturn.status, 201);
  const confirmed = await requestRoute(`/prs/${legacyReturn.body.data._id}/confirm`, { condition: 'Unserviceable' }, 'POST');
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal((await Accountability.findById(legacyAssetId)).active, false);
  assert.equal((await Item.findById(item._id)).quantityOnHand, 0, 'unserviceable return never becomes available stock');
  const consumedDrafts = await requestRoute('/ptr/return-item-drafts');
  assert.ok(!consumedDrafts.body.data.some(row => row.prsNumber === returnSlip.prsNumber));
});
