const test = require('node:test');
const assert = require('node:assert/strict');
const groupItems = require('../src/utils/stationPpeGroups');
test('issued supplies without ICS/PAR appear with their current holder and blank costs', () => {
  const issued = ['Pencil', 'Ballpen', 'Eraser'].map(name => ({ name, classification: 'SUPPLY', holders: [{ name: 'Catherine Lagera', units: [{ quantity: 5, description: `${name} description`, stockNumber: '001' }] }] }));
  const groups = groupItems([], [], issued);
  assert.deepEqual(groups.map(group => group.name), ['Ballpen', 'Eraser', 'Pencil']);
  for (const group of groups) {
    assert.equal(group.rows[0].accountablePerson, 'Catherine Lagera');
    assert.equal(group.rows[0].description, `${group.name} description`);
    assert.equal(group.rows[0].unitCost, '');
    assert.equal(group.rows[0].totalCost, '');
  }
});

test('PPE groups combine matching equipment across receipts and retain each accountable person', () => {
  const item = { name: 'Printer', description: 'Laser printer', stockNumber: 'PR-1', itemType: 'ASSET' };
  const groups = groupItems([
    { _id: 'inv1', item, quantity: 1, unitCost: 10000, propertyNumber: 'P-1' },
    { _id: 'inv2', item: { ...item, name: ' printer ', stockNumber: 'PR-2' }, quantity: 1, unitCost: 12000, propertyNumber: 'P-2' },
    { _id: 'inv3', item: { ...item, name: 'Laptop' }, quantity: 1, unitCost: 30000 },
    { _id: 'inv4', item: { ...item, name: 'Paper', itemType: 'SUPPLY' }, quantity: 10 },
  ], [
    { inventory: 'inv1', employee: 'Old Name', user: { firstName: 'Catherine', lastName: 'Lagera' }, quantity: 1, returnedQuantity: 0 },
    { inventory: 'inv2', employee: 'Old offline name', offlineRecipient: { name: 'Cherie Francisco' }, quantity: 1, returnedQuantity: 0 },
    { inventory: 'inv3', employee: 'Returned holder', quantity: 1, returnedQuantity: 1 },
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups.find(group => group.key === 'laptop').rows[0].accountablePerson, '');
  assert.equal(groups.find(group => group.key === 'paper').rows[0].accountablePerson, '');
  const printers = groups.find(group => group.key === 'printer');
  assert.equal(printers.rows.length, 2);
  assert.deepEqual(printers.rows.map(row => row.accountablePerson), ['Catherine Lagera', 'Cherie Francisco']);
  assert.deepEqual(printers.rows.map(row => row.unitCost), ['', '']);
  assert.deepEqual(printers.rows.map(row => row.totalCost), ['', '']);
  assert.deepEqual(printers.rows.map(row => row.propertyNumber), ['P-1', 'P-2']);
});
test('descriptions include serials only when present and remarks identify recorded condition', () => {
  const item = { name: 'TV', description: 'Black TV', itemType: 'ASSET' };
  const inventories = [
    { _id: 'a', item, serialNumber: 'SN-1', quantity: 1 },
    { _id: 'b', item, quantity: 1 },
    { _id: 'c', item, quantity: 1 },
  ];
  const accounts = ['New', 'Serviceable', 'Unserviceable'].map((condition, i) => ({ inventory: ['a', 'b', 'c'][i], employee: 'Receiver', condition, quantity: 1 }));
  const rows = groupItems(inventories, accounts)[0].rows;
  assert.equal(rows[0].description, 'Black TV\nSerial No. SN-1');
  assert.equal(rows[1].description, 'Black TV');
  assert.equal(rows[2].description, 'Black TV');
  assert.deepEqual(rows.map(row => row.remarks), ['New', 'Serviceable', 'Unserviceable']);
});
