const test = require('node:test');
const assert = require('node:assert/strict');
const { lineAmount, sumAmounts } = require('../src/utils/formAmounts');
const ICS = require('../src/models/InventoryCustodianSlip');
const PAR = require('../src/models/PropertyAcknowledgementReceipt');

test('currency rows and document totals round to two decimals', () => {
  assert.equal(lineAmount(3, 0.1), 0.3);
  assert.equal(lineAmount(1, 1.005), 1.01);
  assert.equal(sumAmounts([0.1, 0.2]), 0.3);
  assert.equal(lineAmount(0, 50000), 0);
});

test('ICS recalculates submitted totals and responds to quantity changes', async () => {
  const record = new ICS({ items: [{ quantity: 3, unitCost: 0.1, totalCost: 999 }] });
  await record.validate();
  assert.equal(record.items[0].totalCost, 0.3);
  assert.equal(record.toJSON().totalAmount, 0.3);
  record.items[0].quantity = 5;
  await record.validate();
  assert.equal(record.totalAmount, 0.5);
});

test('PAR derives row amounts from unit cost and preserves legacy row amounts', async () => {
  const record = new PAR({ items: [{ quantity: 2, unitCost: 50000.15, amount: 1 }, { quantity: 3, amount: 75000 }] });
  await record.validate();
  assert.equal(record.items[0].amount, 100000.3);
  assert.equal(record.items[1].amount, 75000);
  assert.equal(record.totalAmount, 175000.3);
  record.items[0].quantity = 1;
  await record.validate();
  assert.equal(record.items[0].amount, 50000.15);
});
