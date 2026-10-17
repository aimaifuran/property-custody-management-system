const test = require('node:test');
const assert = require('node:assert/strict');
const { propertyCardHistory } = require('../src/utils/propertyCardHistory');

test('receipt, successive issues and serviceable return compute per-item balances and amounts', () => {
  const card = { items: [
    { inventory: { _id: 'chair', unitCost: 45000 }, receiptQuantity: 5, amount: 225000 },
    { inventory: { _id: 'desk', unitCost: 10000 }, receiptQuantity: 3, amount: 30000 },
    { inventory: { _id: 'chair', unitCost: 45000 }, itdQuantity: 2, balanceQuantity: 999, amount: 1 },
    { inventory: { _id: 'desk', unitCost: 10000 }, itdQuantity: 1 },
    { inventory: { _id: 'chair', unitCost: 45000 }, itdQuantity: 1 },
    { inventory: { _id: 'chair', unitCost: 45000 }, receiptQuantity: 1 },
  ] };
  const history = propertyCardHistory(card);
  assert.deepEqual(history.items.map(row => row.balanceQuantity), [5, 3, 3, 2, 2, 3]);
  assert.deepEqual(history.items.map(row => row.amount), [225000, 30000, 90000, 10000, 45000, 45000]);
  assert.equal(card.items[2].balanceQuantity, 999);
});

test('legacy receipt amounts supply unit costs without merging separate receipts', () => {
  const history = propertyCardHistory({ items: [
    { inventory: 'receipt-a', receiptQuantity: 5, amount: 225000 },
    { inventory: 'receipt-b', receiptQuantity: 4, amount: 240000 },
    { inventory: 'receipt-a', itdQuantity: 2 },
    { inventory: 'receipt-b', itdQuantity: 1 },
  ] });
  assert.deepEqual(history.items.map(row => row.balanceQuantity), [5, 4, 3, 3]);
  assert.equal(history.items[2].amount, 90000);
  assert.equal(history.items[3].amount, 60000);
});

test('zero unit costs and decimal currency are calculated without filling unknown costs', () => {
  const history = propertyCardHistory({ entries: [
    { propertyNumber: 'free', receiptQuantity: 2, unitCost: 0 },
    { propertyNumber: 'free', itdQuantity: 1, unitCost: 0 },
    { propertyNumber: 'decimal', receiptQuantity: 3, unitCost: 0.1 },
    { propertyNumber: 'unknown', receiptQuantity: 1 },
  ] });
  assert.deepEqual(history.items.map(row => row.amount), [0, 0, 0.3, null]);
});
