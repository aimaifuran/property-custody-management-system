const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const models = Object.fromEntries(['User', 'Item', 'Inventory', 'InspectionAcceptanceReport', 'PropertyCard', 'RequisitionIssueSlip', 'InventoryCustodianSlip', 'PropertyAcknowledgementReceipt', 'PropertyAccountability', 'LedgerTransaction'].map(name => [name, require(`../src/models/${name}`)]));
const issueRis = require('../src/utils/issueRis');

test('IAR drafts issue actual quantities using their source receipt into the correct accountability forms', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  await Promise.all(Object.values(models).map(Model => Model.init()));
  const server = require('../src/app').listen(0);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await database.stop(); });
  const admin = await models.User.create({ username: 'flow-admin', firstName: 'Supply', lastName: 'Admin', email: 'flow-admin@example.test', password: 'test', office: 'Supply Office', division: 'Admin', position: 'Supply Officer I', role: 'admin', permissions: ['canManageIAR', 'canManageRIS', 'canViewRIS'] });
  const employee = await models.User.create({ username: 'flow-user', firstName: 'Office', lastName: 'Employee', email: 'flow-user@example.test', password: 'test', office: 'Municipal Accounting Office', division: 'Finance', position: 'Accountant', role: 'user', permissions: ['canViewRIS'] });
  // Standalone create and edit must calculate amounts on the server as well.
  const headers = { Authorization: `Bearer ${jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' };
  const person = { name: 'Supply Admin', position: 'Supply Officer I', date: '2026-10-08' };
  for (const type of ['ics', 'par']) {
    const payload = { entityName: 'LGU', fundCluster: 'General', office: 'Supply', autoNumber: true,
      receivedBy: person, receivedFrom: person, issuedBy: person,
      items: [{ quantity: 3, unit: 'unit', description: 'Calculation test', unitCost: 0.1,
        totalCost: 999, amount: 999, inventoryItemNo: 'CALC', estimatedUsefulLife: '5 years', propertyNumber: 'CALC', dateAcquired: '2026-10-08' }] };
    const createdResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/${type}`, { method: 'POST', headers, body: JSON.stringify(payload) });
    const created = await createdResponse.json();
    assert.equal(createdResponse.status, 201, JSON.stringify(created));
    const amountField = type === 'ics' ? 'totalCost' : 'amount';
    assert.equal(created.data.items[0][amountField], 0.3);
    payload.items[0].quantity = 7;
    const editedResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/${type}/${created.data._id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
    const edited = await editedResponse.json();
    assert.equal(editedResponse.status, 200, JSON.stringify(edited));
    assert.equal(edited.data.items[0][amountField], 0.7);
    assert.equal(edited.data.totalAmount, 0.7);
    await models[type === 'ics' ? 'InventoryCustodianSlip' : 'PropertyAcknowledgementReceipt'].deleteOne({ _id: created.data._id });
  }
  const receive = async (number, items, poDate = '2026-10-01') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/iar`, { method: 'POST', headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ entityName: 'LGU Carigara', fundCluster: 'Trust Fund', supplierName: 'Delivery Supplier', poNumber: `PO-${number}`, poDate, responsibilityCenterCode: '004', iarNumber: number, iarDate: '2026-10-08', invoiceNumber: `INV-${number}`, invoiceDate: '2026-10-08', inspectionDate: '2026-10-08', inspectedBy: 'Inspector', acceptanceDate: '2026-10-08', acceptanceStatus: 'Complete', custodian: 'Supply Admin', items }) });
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    return result.data;
  };
  const rows = [
    { stockPropertyNumber: 'FLOW-PRINTER', propertyNumber: 'PRINTER-ORIGINAL', description: 'Printer', unit: 'unit', quantity: 5, unitCost: 20000, itemType: 'ASSET' },
    { stockPropertyNumber: 'FLOW-EXACT', propertyNumber: 'EXACT-ORIGINAL', description: 'Computer', unit: 'unit', quantity: 2, unitCost: 50000, itemType: 'ASSET' },
    { stockPropertyNumber: 'FLOW-SUPPLY', description: 'Supply box', unit: 'box', quantity: 4, unitCost: 60000, itemType: 'SUPPLY' },
    { stockPropertyNumber: 'FLOW-ZERO', description: 'Not issued', unit: 'unit', quantity: 1, unitCost: 70000, itemType: 'ASSET' },
  ];
  const iar = await receive('901', rows);
  const ris = await models.RequisitionIssueSlip.findById(iar.requisition);
  assert.equal(ris.status, 'DRAFT');
  assert.ok(ris.items.every(row => row.quantityIssued == null));
  assert.equal(await models.InventoryCustodianSlip.countDocuments(), 0);
  assert.equal(await models.PropertyAcknowledgementReceipt.countDocuments(), 0);
  assert.equal((await models.PropertyCard.findOne({ iar: iar._id })).items.length, 4);
  const sourceInventory = await models.Inventory.findOne({ inspectionAcceptanceReport: iar._id, propertyNumber: 'PRINTER-ORIGINAL' });

  // A newer receipt must not replace the original draft's price, identity or date.
  await receive('902', rows.slice(0, 2).map(row => ({ ...row, quantity: 1, propertyNumber: `${row.propertyNumber}-NEW`, unitCost: row.unitCost === 20000 ? 80000 : 10000 })), '2026-10-07');
  assert.equal((await models.Item.findOne({ stockNumber: 'FLOW-PRINTER' })).cost, 80000);
  ris.requestedBy = { user: employee._id, name: 'Office Employee', designation: 'Accountant' };
  ris.office = employee.office;
  ris.purpose = 'Office operations';
  [2, 1, 1, 0].forEach((quantity, index) => { ris.items[index].quantityIssued = quantity; });
  ris.status = 'PENDING_REVIEW';
  await ris.save();
  const review = await fetch(`http://127.0.0.1:${server.address().port}/api/ris/${ris._id}/review`, { method: 'POST', headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(review.status, 200);
  const reviewed = await review.json();
  assert.deepEqual(reviewed.data.items.map(row => row.quantityIssued), [2, 1, 1, 0]);
  await issueRis(ris._id, admin, {}, { approve: true });
  const ics = await models.InventoryCustodianSlip.findOne({ ris: ris._id });
  const par = await models.PropertyAcknowledgementReceipt.findOne({ ris: ris._id });
  assert.equal(ics.items.length, 1);
  assert.equal(ics.items[0].quantity, 2);
  assert.equal(ics.items[0].unitCost, 20000);
  assert.equal(ics.items[0].totalCost, 40000);
  assert.equal(ics.items[0].inventoryItemNo, 'PRINTER-ORIGINAL');
  const correction = { ...ics.toObject(), items: ics.items.map(item => ({ ...item.toObject(), estimatedUsefulLife: '5 years', description: 'Corrected printer description' })), receivedBy: { ...ics.receivedBy.toObject(), date: '2026-10-08' }, receivedFrom: { ...ics.receivedFrom.toObject(), date: '2026-10-08' }, remarks: 'Corrected ICS' };
  const editIcs = body => fetch(`http://127.0.0.1:${server.address().port}/api/ics/${ics._id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  const correctedResponse = await editIcs(correction);
  const corrected = await correctedResponse.json();
  assert.equal(correctedResponse.status, 200, JSON.stringify(corrected));
  assert.equal(corrected.data.items[0].estimatedUsefulLife, '5 years');
  assert.equal(corrected.data.items[0].description, 'Corrected printer description');
  assert.equal(String(corrected.data.user), String(employee._id));
  assert.equal(corrected.data.totalAmount, 40000);
  correction.items[0].quantity = 3;
  assert.equal((await editIcs(correction)).status, 409);

  assert.equal(ics.receivedFrom.position, 'Supply Officer I');
  assert.equal(par.items.length, 1);
  assert.equal(par.items[0].amount, 50000);
  assert.equal(par.items[0].propertyNumber, 'EXACT-ORIGINAL');
  assert.equal(par.items[0].dateAcquired.toISOString().slice(0, 10), '2026-10-01');
  for (const form of [ics, par]) {
    assert.equal(form.entityName, iar.entityName);
    assert.equal(form.fundCluster, iar.fundCluster);
    assert.equal(String(form.user), String(employee._id));
    assert.equal(String(form.iar), iar._id);
    assert.equal(form.receivedBy.name, 'Office Employee');
    assert.equal(form.receivedBy.position, 'Accountant');
  }
  assert.equal((await models.Item.findOne({ stockNumber: 'FLOW-PRINTER' })).quantityOnHand, 4);
  assert.equal((await models.Item.findOne({ stockNumber: 'FLOW-ZERO' })).quantityOnHand, 1);
  assert.equal((await models.Item.findOne({ stockNumber: 'FLOW-SUPPLY' })).quantityOnHand, 3);
  assert.equal(await models.PropertyAccountability.countDocuments({ ris: ris._id }), 2);
  const accountability = await models.PropertyAccountability.findOne({ issuanceForm: ics._id });
  assert.equal(String(accountability.inventory), String(sourceInventory._id));
  const card = await models.PropertyCard.findOne({ iar: iar._id });
  const movement = card.items.find(row => row.referenceParNo === ics.icsNumber);
  assert.equal(movement.itdQuantity, 2);
  assert.equal(movement.balanceQuantity, 4);
  assert.equal(movement.amount, 40000);
  assert.equal((await models.PropertyCard.findOne({ iar: { $ne: iar._id } })).items.length, 2);
  const issued = await models.RequisitionIssueSlip.findById(ris._id);
  assert.equal(issued.items[2].formType, 'SUPPLY');
  assert.equal(issued.items[3].quantityIssued, 0);
  await issueRis(ris._id, admin, {}, { approve: true });
  assert.equal(await models.InventoryCustodianSlip.countDocuments({ ris: ris._id }), 1);
  assert.equal((await models.Item.findOne({ stockNumber: 'FLOW-PRINTER' })).quantityOnHand, 4);
  // The Status button records actual stock/accountability movements, not just a label.
  const parAsset = await models.PropertyAccountability.findOne({ issuanceForm: par._id });
  const returnEndpoint = `http://127.0.0.1:${server.address().port}/api/users/${employee._id}/records/returned`;
  const markBody = { accountability: parAsset._id, quantity: 1 };
  const nonAdmin = await fetch(returnEndpoint, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${jwt.sign({ id: employee._id }, process.env.JWT_SECRET || 'dev-secret')}` }, body: JSON.stringify(markBody) });
  assert.equal(nonAdmin.status, 403);
  const quickReturn = await fetch(returnEndpoint, { method: 'POST', headers, body: JSON.stringify(markBody) });
  const quickResult = await quickReturn.json();
  assert.equal(quickReturn.status, 201, JSON.stringify(quickResult));
  assert.equal(quickResult.data.status, 'RETURNED');
  assert.equal((await models.PropertyAccountability.findById(parAsset._id)).active, false);
  const balanceAfterReturn = (await models.Item.findOne({ stockNumber: 'FLOW-EXACT' })).quantityOnHand;
  assert.equal((await fetch(returnEndpoint, { method: 'POST', headers, body: JSON.stringify(markBody) })).status, 409);
  assert.equal((await models.Item.findOne({ stockNumber: 'FLOW-EXACT' })).quantityOnHand, balanceAfterReturn);
  const recordsResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/users/${employee._id}/records`, { headers });
  const account = await recordsResponse.json();
  const parRow = account.data.risRows.find(row => String(row.itemId) === String(parAsset.risItem));
  assert.equal(parRow.status, 'Successfully returned');
  assert.equal(parRow.quantityRemaining, 0);
  assert.ok(account.data.returnSlips.some(row => row._id === quickResult.data._id));
  // Consumable returns use the same button and reject stale repeated quantities.
  const supplyBody = { risId: ris._id, itemId: issued.items[2]._id, quantity: 1 };
  const supplyReturn = await fetch(returnEndpoint, { method: 'POST', headers, body: JSON.stringify(supplyBody) });
  assert.equal(supplyReturn.status, 201, await supplyReturn.text());
  assert.equal((await fetch(returnEndpoint, { method: 'POST', headers, body: JSON.stringify(supplyBody) })).status, 409);
  // Admin records the physical return; the user's read-only page receives the result.
  await Promise.all(['PropertyReturnSlip', 'ReturnedSupply'].map(name => require(`../src/models/${name}`).init()));
  const returnResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/prs`, { method: 'POST', headers, body: JSON.stringify({
    lguName: 'LGU Carigara', purpose: 'Return of office equipment', autoNumber: true,
    returnedBy: { user: employee._id, name: 'Office Employee', designation: 'Accountant', date: '2026-10-08' },
    returnedTo: { name: 'Supply Admin', designation: 'Supply Officer I', date: '2026-10-08' },
    items: [{ accountability: accountability._id, ris: ris._id, risItem: accountability.risItem, quantity: 2,
      unit: 'unit', description: 'Printer', mrNumber: ris.risNumber, unitValue: 20000, condition: 'Serviceable' }],
  }) });
  const recordedReturn = await returnResponse.json();
  assert.equal(returnResponse.status, 201, JSON.stringify(recordedReturn));
  const userReturnsResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/ris/my-returns`, { headers: { Authorization: `Bearer ${jwt.sign({ id: employee._id }, process.env.JWT_SECRET || 'dev-secret')}` } });
  const userReturns = await userReturnsResponse.json();
  assert.equal(userReturnsResponse.status, 200);
  const returnedPrinter = userReturns.data.find(row => String(row.itemId) === String(accountability.risItem));
  assert.ok(returnedPrinter, JSON.stringify(userReturns));
  assert.equal(returnedPrinter.quantityReturned, 2);
  assert.equal(returnedPrinter.quantityRemaining, 0);
  assert.equal(returnedPrinter.status, 'Successfully returned');
  assert.equal((await models.Item.findOne({ stockNumber: 'FLOW-PRINTER' })).quantityOnHand, 6);
  // Offline recipients have their own identity and never receive a login account.
  const Offline = require('../src/models/OfflineRecipient'); await Offline.init();
  const userCount = await models.User.countDocuments();
  const offlineResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/offline-recipients`, { method: 'POST', headers, body: JSON.stringify({ name: 'Office Employee', office: 'External Office', designation: 'Office Representative' }) });
  const offline = (await offlineResponse.json()).data;
  assert.equal(offlineResponse.status, 201);
  assert.equal(await models.User.countDocuments(), userCount);
  const offlinePerson = { offlineRecipient: offline._id, name: offline.name, designation: offline.office, date: '2026-10-08' };
  const offlineRisResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/ris`, { method: 'POST', headers, body: JSON.stringify({
    entityName: 'LGU', fundCluster: 'General', division: 'External', office: offline.office, responsibilityCenterCode: '001', purpose: 'Office equipment', date: '2026-10-08', autoNumber: true,
    requestedBy: offlinePerson, receivedBy: offlinePerson, approvedBy: { ...person, designation: 'Supply Officer' }, issuedBy: { ...person, designation: 'Supply Officer' },
    items: [rows[0], rows[1], rows[2]].map(row => ({ stockNumber: row.stockPropertyNumber, unit: row.unit, description: row.description, quantityRequested: 2, quantityIssued: 2 }))
  }) });
  const offlineRisBody = await offlineRisResponse.json();
  assert.equal(offlineRisResponse.status, 201, JSON.stringify(offlineRisBody));
  const offlineRis = offlineRisBody.data;
  const pendingRecordsResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/offline-recipients/${offline._id}/records`, { headers });
  const pendingRecords = (await pendingRecordsResponse.json()).data;
  assert.equal(pendingRecords.risRows.length, 3);
  assert.ok(pendingRecords.risRows.every(row => !row.issued && row.status === 'Pending admin review'));
  const pendingOfflineReturn = await fetch(`http://127.0.0.1:${server.address().port}/api/offline-recipients/${offline._id}/records/returned`, { method: 'POST', headers, body: JSON.stringify({ risId: offlineRis._id, itemId: offlineRis.items[0]._id, quantity: 1, condition: 'Serviceable' }) });
  assert.equal(pendingOfflineReturn.status, 409);

  // Reopening and editing an offline requisition can add/remove rows without creating a separate RIS.
  const offlineEdit = { ...offlineRis, items: [offlineRis.items[0]] };
  const editOffline = body => fetch(`http://127.0.0.1:${server.address().port}/api/ris/${offlineRis._id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  assert.equal((await editOffline(offlineEdit)).status, 200);
  offlineEdit.items = offlineRis.items;
  const expandedResponse = await editOffline(offlineEdit);
  const expanded = await expandedResponse.json();
  assert.equal(expandedResponse.status, 200, JSON.stringify(expanded));
  assert.equal(expanded.data.items.length, 3);
  assert.equal(expanded.data.requestedBy.offlineRecipient, offline._id);
  const allRequestsResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/ris`, { headers });
  const allRequests = (await allRequestsResponse.json()).data;
  assert.equal(allRequests.filter(row => row._id === offlineRis._id).length, 1);
  assert.equal(allRequests.find(row => row._id === offlineRis._id).items.length, 3);
  await issueRis(offlineRis._id, admin, {}, { approve: true });
  const getOfflineRecords = async () => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api/offline-recipients/${offline._id}/records`, { headers }); assert.equal(response.status, 200); return (await response.json()).data; };
  let offlineRecords = await getOfflineRecords();
  assert.equal(offlineRecords.risRows.length, 3);
  assert.equal(offlineRecords.assets.length, 2);
  assert.ok(offlineRecords.assets.every(row => String(row.offlineRecipient) === offline._id && !row.user));
  const offlineForms = await models.InventoryCustodianSlip.find({ offlineRecipient: offline._id });
  assert.equal(offlineForms.length, 1);
  assert.equal(await models.PropertyAcknowledgementReceipt.countDocuments({ offlineRecipient: offline._id }), 1);
  assert.ok(!offlineForms[0].user);
  // Same name as a real user cannot leak these issues into that user's records.
  const ownResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/users/${employee._id}/records`, { headers });
  assert.ok(!(await ownResponse.json()).data.risRows.some(row => String(row.risId) === offlineRis._id));
  const forbidden = await fetch(`http://127.0.0.1:${server.address().port}/api/offline-recipients`, { headers: { Authorization: `Bearer ${jwt.sign({ id: employee._id }, process.env.JWT_SECRET || 'dev-secret')}` } });
  assert.equal(forbidden.status, 403);
  await fetch(`http://127.0.0.1:${server.address().port}/api/offline-recipients/${offline._id}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Renamed Recipient', office: offline.office }) });
  offlineRecords = await getOfflineRecords(); assert.equal(offlineRecords.risRows.length, 3);
  // A partial admin PRS remains attached to the offline recipient, not a same-named login.
  const offlineSupply = offlineRecords.risRows.find(row => row.formType === 'SUPPLY');
  const partialResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/prs`, { method: 'POST', headers, body: JSON.stringify({
    lguName: 'LGU', purpose: 'Returned To Stock', autoNumber: true,
    returnedBy: { ...offlinePerson, name: 'Renamed Recipient' }, returnedTo: { name: 'Supply Admin', designation: 'Supply Officer', date: '2026-10-08' },
    items: [{ ris: offlineSupply.risId, risItem: offlineSupply.itemId, quantity: 1, unit: 'box', description: 'Supply box', mrNumber: offlineRis.risNumber, unitValue: 60000 }]
  }) });
  assert.equal(partialResponse.status, 201, await partialResponse.text());
  offlineRecords = await getOfflineRecords();
  assert.equal(offlineRecords.risRows.find(row => row.formType === 'SUPPLY').status, 'Partially returned');
  assert.equal(offlineRecords.risRows.find(row => row.formType === 'SUPPLY').quantityRemaining, 1);
  const offlineAsset = offlineRecords.assets[0];
  const offlineStock = await models.Item.findById(offlineAsset.inventory.item._id);
  const beforeUnserviceable = offlineStock.quantityOnHand;
  const offlineReturnPath = `http://127.0.0.1:${server.address().port}/api/offline-recipients/${offline._id}/records/returned`;
  const offlinePartial = { accountability: offlineAsset._id, quantity: 1, expectedRemaining: 2, condition: 'Unserviceable' };
  const damagedResponse = await fetch(offlineReturnPath, { method: 'POST', headers, body: JSON.stringify(offlinePartial) });
  const damagedBody = await damagedResponse.json();
  assert.equal(damagedResponse.status, 201, JSON.stringify(damagedBody));
  assert.equal(damagedBody.data.items[0].condition, 'Unserviceable');
  assert.equal((await models.Item.findById(offlineStock._id)).quantityOnHand, beforeUnserviceable);
  assert.equal((await fetch(offlineReturnPath, { method: 'POST', headers, body: JSON.stringify(offlinePartial) })).status, 409);
  offlineRecords = await getOfflineRecords();
  assert.equal(offlineRecords.assets.find(row => row._id === offlineAsset._id).returnedQuantity, 1);
  for (const row of offlineRecords.risRows) {
    const asset = offlineRecords.assets.find(asset => String(asset.risItem) === String(row.itemId));
    const body = { accountability: asset?._id, risId: row.risId, itemId: row.itemId, quantity: row.quantityRemaining };
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/offline-recipients/${offline._id}/records/returned`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.status, 201, await response.text());
    const repeat = await fetch(`http://127.0.0.1:${server.address().port}/api/offline-recipients/${offline._id}/records/returned`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(repeat.status, 409);
  }
  offlineRecords = await getOfflineRecords();
  assert.equal(offlineRecords.assets.length, 0);
  assert.ok(offlineRecords.risRows.every(row => row.quantityRemaining === 0 && row.status === 'Successfully returned'));
  assert.equal(offlineRecords.returnSlips.length, 5);

  // An IAR-generated request can add an item received under another IAR.
  const sourceReceipt = await receive('903', [{ stockPropertyNumber: 'MULTI-SOURCE', description: 'Source item', unit: 'unit', quantity: 3, unitCost: 100, itemType: 'ASSET' }]);
  await receive('904', [{ stockPropertyNumber: 'MULTI-OTHER', description: 'Other requested item', unit: 'unit', quantity: 4, unitCost: 200, itemType: 'ASSET' }]);
  const sourceRequest = await models.RequisitionIssueSlip.findById(sourceReceipt.requisition);
  const requestEdit = { ...sourceRequest.toObject(), office: employee.office, division: 'Finance', responsibilityCenterCode: '001', purpose: 'Multiple requested items', date: '2026-10-08',
    requestedBy: { user: employee._id, name: 'Office Employee', designation: 'Accountant', date: '2026-10-08' },
    approvedBy: { ...person, designation: 'Supply Officer' }, issuedBy: { ...person, designation: 'Supply Officer' }, receivedBy: { ...person, designation: 'Accountant' },
    items: [{ ...sourceRequest.items[0].toObject(), quantityRequested: 1, quantityIssued: 1 }, { stockNumber: 'MULTI-OTHER', description: 'Other requested item', unit: 'unit', quantityRequested: 2, quantityIssued: 2 }] };
  const multipleResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/ris/${sourceRequest._id}`, { method: 'PUT', headers, body: JSON.stringify(requestEdit) });
  assert.equal(multipleResponse.status, 200, await multipleResponse.text());
  await issueRis(sourceRequest._id, admin, {}, { approve: true });
  const multipleForm = await models.InventoryCustodianSlip.findOne({ ris: sourceRequest._id });
  assert.equal(multipleForm.items.length, 2);
  assert.deepEqual(multipleForm.items.map(row => row.unitCost), [100, 200]);
  assert.deepEqual(multipleForm.items.map(row => row.totalCost), [100, 400]);
  assert.equal((await models.Item.findOne({ stockNumber: 'MULTI-SOURCE' })).quantityOnHand, 2);
  assert.equal((await models.Item.findOne({ stockNumber: 'MULTI-OTHER' })).quantityOnHand, 2);

  // Partial returns retain the outstanding units and inspect condition independently.
  const partialAsset = await models.PropertyAccountability.findOne({ issuanceForm: multipleForm._id, quantity: 2 });
  const partialPath = `http://127.0.0.1:${server.address().port}/api/users/${employee._id}/records/returned`;
  const sendPartial = body => fetch(partialPath, { method: 'POST', headers, body: JSON.stringify({ accountability: partialAsset._id, ...body }) });
  assert.equal((await sendPartial({ quantity: 1, condition: 'Invalid' })).status, 400);
  assert.equal((await sendPartial({ quantity: 3, condition: 'Serviceable' })).status, 409);
  const serviceableResponse = await sendPartial({ quantity: 1, expectedRemaining: 2, condition: 'Serviceable' });
  assert.equal(serviceableResponse.status, 201, await serviceableResponse.text());
  assert.equal((await models.Item.findOne({ stockNumber: 'MULTI-OTHER' })).quantityOnHand, 3);
  assert.equal((await models.PropertyAccountability.findById(partialAsset._id)).active, true);
  const finalDamagedResponse = await sendPartial({ quantity: 1, expectedRemaining: 1, condition: 'Unserviceable' });
  assert.equal(finalDamagedResponse.status, 201, await finalDamagedResponse.text());
  assert.equal((await models.Item.findOne({ stockNumber: 'MULTI-OTHER' })).quantityOnHand, 3);
  assert.equal((await models.PropertyAccountability.findById(partialAsset._id)).active, false);
  const finalRecordsResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/users/${employee._id}/records`, { headers });
  const finalRow = (await finalRecordsResponse.json()).data.risRows.find(row => String(row.itemId) === String(partialAsset.risItem));
  assert.equal(finalRow.quantityRemaining, 0);
  assert.equal(finalRow.status, 'Successfully returned');
  assert.deepEqual(finalRow.returns.map(row => row.condition).sort(), ['Serviceable', 'Unserviceable']);

  // Actual request and return routes must enqueue mail, not just update the records.
  const Email = require('../src/models/WorkflowEmail');
  assert.ok(await Email.exists({ user: employee._id, eventKey: /^REQUESTED:/ }));
  assert.ok(await Email.exists({ user: employee._id, eventKey: /^ISSUED:/ }));
  assert.ok(await Email.exists({ user: employee._id, eventKey: /^RETURNED:/ }));
  assert.equal(await Email.countDocuments({ user: { $ne: employee._id } }), 0);

});
