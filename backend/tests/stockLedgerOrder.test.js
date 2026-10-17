const test = require('node:test');
const assert = require('node:assert/strict');
const { sortStockItems, isNewStockItem } = require('../src/utils/stockLedgerOrder');

test('recent receipts lead the list regardless of newer issuance movements or stock code', () => {
  const rows = [
    { stockNumber: '001', name: 'Printer', lastReceivedAt: '2026-10-14', lastMovement: '2026-10-18' },
    { stockNumber: '999', name: 'Ink', lastReceivedAt: '2026-10-17', lastMovement: '2026-10-17' },
    { stockNumber: '000', name: 'Unreceived' },
  ];
  assert.deepEqual(sortStockItems(rows).map(row => row.stockNumber), ['999', '001', '000']);
  assert.deepEqual(sortStockItems(rows, 'name').map(row => row.name), ['Ink', 'Printer', 'Unreceived']);
  assert.equal(rows[0].name, 'Printer', 'Sorting does not mutate the input');
});

test('New applies for 24 hours after first receipt, not each replenishment', () => {
  const now = Date.parse('2026-10-17T10:00:00Z');
  assert.equal(isNewStockItem({ firstReceivedAt: '2026-10-17T09:00:00Z' }, now), true);
  assert.equal(isNewStockItem({ firstReceivedAt: '2026-10-14', lastReceivedAt: '2026-10-17' }, now), false);
  assert.equal(isNewStockItem({}, now), false);
  assert.equal(isNewStockItem({ firstReceivedAt: '2026-10-18' }, now), false);
});
