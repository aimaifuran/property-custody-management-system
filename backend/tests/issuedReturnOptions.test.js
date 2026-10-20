const test = require('node:test');
const assert = require('node:assert/strict');
test('selected return items are hidden in other rows and restored when cleared', async () => {
  const { availableReturnOptions } = await import('../../frontend/src/utils/issuedReturnOptions.js');
  const options = [{ value: 'r:a' }, { value: 'r:b' }];
  const rows = [{ ris: 'r', risItem: 'a' }, { ris: 'r', risItem: 'b' }, {}];
  assert.deepEqual(availableReturnOptions(options, rows, 2), []);
  assert.deepEqual(availableReturnOptions(options, rows, 0), [{ value: 'r:a' }]);
  rows[0] = {};
  assert.deepEqual(availableReturnOptions(options, rows, 2), [{ value: 'r:a' }]);
});
test('duplicate item names use only serial identifiers and never PO numbers', async () => {
  const { issuedReturnOptions } = await import('../../frontend/src/utils/issuedReturnOptions.js');
  const records = [{ _id: 'ris1', items: [
    { _id: 'a', itemName: 'Printer', serialNumber: 'SN-1', poNumber: 'PO-1' },
    { _id: 'b', itemName: 'Printer', poNumber: 'PO-2' },
    { _id: 'c', itemName: 'Laptop', serialNumber: 'SN-3' },
  ] }];
  assert.deepEqual(issuedReturnOptions(records).map(option => option.label), ['Printer — Serial No. SN-1', 'Printer', 'Laptop']);
  assert.equal(issuedReturnOptions(records)[1].value, 'ris1:b');
});
test('unserialized units in a requisition combine into their full quantity while retaining exact return links', async () => {
  const { groupUnserializedReturns, expandReturnRows, issuedReturnOptions } = await import('../../frontend/src/utils/issuedReturnOptions.js');
  const records = [{ _id: 'r', risNumber: 'RIS-1', items: [
    ...Array.from({ length: 5 }, (_, i) => ({ _id: `e${i}`, itemName: 'Eraser', unit: 'Pcs', description: 'Grey', quantityRemaining: 1, unitCost: 40, poNumber: 'PO-1' })),
    { _id: 'tv1', itemName: 'TV', serialNumber: 'SN-1', quantityRemaining: 1, unitCost: 100 },
    { _id: 'tv2', itemName: 'TV', serialNumber: 'SN-2', quantityRemaining: 1, unitCost: 100 },
  ] }];
  const grouped = groupUnserializedReturns(records);
  assert.equal(grouped[0].items.length, 3);
  assert.equal(grouped[0].items[0].quantityRemaining, 5);
  assert.equal(grouped[0].items[0].totalValue, 200);
  assert.equal(expandReturnRows([grouped[0].items[0]]).length, 5);
  assert.deepEqual(expandReturnRows([grouped[0].items[0]]).map(row => row.risItem), ['e0', 'e1', 'e2', 'e3', 'e4']);
  assert.deepEqual(issuedReturnOptions(grouped).map(row => row.label), ['Eraser', 'TV — Serial No. SN-1', 'TV — Serial No. SN-2']);
});
