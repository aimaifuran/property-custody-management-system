const test = require('node:test');
const assert = require('node:assert/strict');
test('one item row keeps one stock number regardless of quantity', async () => {
  const { singleStockPropertyNumber, nextStockPropertyNumber } = await import('../../frontend/src/utils/nextStockPropertyNumber.js');
  const item = { stockPropertyNumber: '001', quantity: 10, serialNumber: '' };
  assert.equal(singleStockPropertyNumber(item), '001');
  assert.equal(nextStockPropertyNumber([item]), '002');
  assert.equal(singleStockPropertyNumber({ ...item, stockPropertyNumber: '001 – 010', quantity: 5 }), '001');
  assert.equal(singleStockPropertyNumber({ ...item, quantity: 1 }), '001');
  assert.equal(singleStockPropertyNumber({ ...item, serialNumber: 'SN-1' }), '001');
  assert.equal(singleStockPropertyNumber({ ...item, stockPropertyNumber: 'TV-001' }), 'TV-001');
});

test('new IAR rows increment the previous stock number and retain leading zeroes', async () => {
  const { nextStockPropertyNumber } = await import('../../frontend/src/utils/nextStockPropertyNumber.js');
  const rows = values => values.map(stockPropertyNumber => ({ stockPropertyNumber }));
  assert.equal(nextStockPropertyNumber(rows(['001'])), '002');
  assert.equal(nextStockPropertyNumber(rows(['001', '002'])), '003');
  assert.equal(nextStockPropertyNumber(rows(['009'])), '010');
  assert.equal(nextStockPropertyNumber(rows(['TV-099'])), 'TV-100');
  assert.equal(nextStockPropertyNumber(rows(['003', '002'])), '004');
  assert.equal(nextStockPropertyNumber(rows(['001', ''])), '002');
  assert.equal(nextStockPropertyNumber(rows([''])), '');
  assert.equal(nextStockPropertyNumber(rows(['TV'])), '');
});
