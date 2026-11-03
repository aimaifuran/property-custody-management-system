const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const IAR = require('../src/models/InspectionAcceptanceReport');
const Inventory = require('../src/models/Inventory');
const Property = require('../src/models/Property');
const RIS = require('../src/models/RequisitionIssueSlip');
const PAR = require('../src/models/PropertyAcknowledgementReceipt');
const Card = require('../src/models/PropertyCard');
const User = require('../src/models/User');
const Setting = require('../src/models/Setting');
const PTR = require('../src/models/PropertyTransferReport');
const Accountability = require('../src/models/PropertyAccountability');
const issueRis = require('../src/utils/issueRis');

test('admin inventory item numbers flow from IAR to ICS, PAR and PPE list', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  await Promise.all([IAR, Inventory, Property, RIS, PAR, Card].map(Model => Model.init()));
  await Setting.create({ entityName: 'LGU' });
  const server = require('../src/app').listen(0);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await database.stop(); });
  const makeUser = (name, role) => User.create({ username: name, firstName: name, lastName: 'Test', email: `${name}@example.test`, password: 'test', office: 'Treasury', division: 'Finance', role, permissions: ['canViewRIS'] });
  const admin = await makeUser('admin', 'admin');
  const recipient = await makeUser('recipient', 'user');
  const receiver = await makeUser('receiver', 'user');
  const request = async (url, body, actor = admin, method = 'POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, { method, headers: { Authorization: `Bearer ${jwt.sign({ id: actor._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const payload = { entityName: 'LGU', fundCluster: 'General Fund', supplierName: 'Supplier', poNumber: 'PO-1', poDate: '2026-10-14', responsibilityCenterCode: 'Supply', iarNumber: '1001', iarDate: '2026-10-14', invoiceNumber: 'INV-1', invoiceDate: '2026-10-14', inspectionDate: '2026-10-14', inspectedBy: 'Inspector', acceptanceDate: '2026-10-14', custodian: 'Custodian', items: [
    { stockPropertyNumber: 'LAPTOP', propertyPlantAndEquipment: 'IT Equipment', description: 'Laptop A', serialNumber: 'SN-A', quantity: 1, unit: 'unit', unitCost: 45000 },
    { stockPropertyNumber: 'LAPTOP', propertyPlantAndEquipment: 'IT Equipment', description: 'Laptop B', serialNumber: 'SN-B', quantity: 1, unit: 'unit', unitCost: 60000 },
  ] };
  payload.items[0].inventoryItemNo = 'ADMIN-ICS-001';
  payload.items[1].inventoryItemNo = 'ADMIN-PAR-001';
  const saved = await request('/iar', payload);
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const iar = saved.body.data;
  assert.equal(iar.items[0].inventoryItemNo, 'ADMIN-ICS-001');
  delete payload.items[0].inventoryItemNo;
  delete payload.items[1].inventoryItemNo;
  const units = await Inventory.find({ inspectionAcceptanceReport: iar._id }).sort({ serialNumber: 1 }).populate('item');
  assert.equal(units.length, 2);
  assert.equal(units[0].propertyNumber, 'ADMIN-ICS-001');
  assert.equal(units[1].propertyNumber, 'ADMIN-PAR-001');
  const makeRis = (number, inventory) => RIS.create({ risNumber: number, entityName: 'LGU', fundCluster: 'General Fund', office: 'Treasury', status: 'APPROVED', requestedBy: { user: recipient._id, name: 'recipient Test' }, items: [{ stockNumber: units.find(unit => String(unit._id) === String(inventory)).item.stockNumber, description: 'Laptop', quantityRequested: 1, quantityIssued: 1, inventory }] });
  for (const [index, type] of [[0, 'ICS'], [1, 'PAR']]) {
    const ris = await makeRis(`RIS-ADMIN-${type}`, units[index]._id);
    await issueRis(ris._id, admin);
    const Model = type === 'ICS' ? require('../src/models/InventoryCustodianSlip') : PAR;
    const form = await Model.findOne({ ris: ris._id });
    assert.equal(form.items[0][type === 'ICS' ? 'inventoryItemNo' : 'propertyNumber'], `ADMIN-${type}-001`);
  }
  const accounts = await Accountability.find({ active: true }).populate('user');
  const groups = require('../src/utils/stationPpeGroups')(await Inventory.find({ inspectionAcceptanceReport: iar._id }).populate('item'), accounts);
  assert.deepEqual(new Set(groups.flatMap(group => group.rows.map(row => row.propertyNumber))), new Set(['ADMIN-ICS-001', 'ADMIN-PAR-001']));
  assert.deepEqual(groups.flatMap(group => group.rows.map(row => [row.unitCost, row.totalCost])).sort((a, b) => a[0] - b[0]), [[45000, 45000], [60000, 60000]]);
  const reportPayload = { accountGroup: 'IT Equipment', governmentUnit: 'LGU', date: '2026-11-03', preparedBy: 'Preparer', preparedDesignation: 'Supply Officer', reviewedBy: 'Reviewer', reviewedDesignation: 'Head', rows: groups.flatMap(group => group.rows) };
  const report = await request('/ppe-station-reports', reportPayload);
  assert.equal(report.status, 201, JSON.stringify(report.body));
  assert.deepEqual(report.body.data.rows.map(row => row.totalCost).sort((a, b) => a - b), [45000, 60000]);
  const updated = await request(`/ppe-station-reports/${report.body.data._id}`, reportPayload, admin, 'PUT');
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.deepEqual(updated.body.data.rows.map(row => row.unitCost).sort((a, b) => a - b), [45000, 60000]);
  const duplicate = await request('/iar', { ...payload, iarNumber: '1002', items: [{ ...payload.items[0], inventoryItemNo: 'ADMIN-ICS-001' }] });
  assert.equal(duplicate.status, 400);
  const bulk = await request('/iar', { ...payload, iarNumber: '1003', items: [{ ...payload.items[0], serialNumber: '', quantity: 2, inventoryItemNo: 'ADMIN-BULK' }] });
  assert.equal(bulk.status, 400);
});
