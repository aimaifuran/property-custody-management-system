const test = require('node:test');
const assert = require('node:assert/strict');
const { applyAccounting, manualRows } = require('../src/utils/monthlyAccounting');
const row = { source: 'RIS', sourceId: '1', sourceRow: 0, quantity: 4, unitCost: 4000, totalCost: 16000 };
test('source prices stay blank; accounting amounts are independent optional inputs', () => {
  assert.equal(manualRows([row])[0].unitCost, null);
  assert.equal(manualRows([row])[0].totalCost, null);
  const entered = applyAccounting([row], [{ ...row, unitCost: '12', totalCost: '37' }])[0];
  assert.equal(entered.unitCost, 12);
  assert.equal(entered.totalCost, 37);
  assert.equal(entered.quantity, 4);
  const cleared = applyAccounting([entered], [{ ...row, unitCost: '', totalCost: null }])[0];
  assert.equal(cleared.unitCost, null);
  assert.equal(cleared.totalCost, null);
  assert.equal(applyAccounting([row], [{ ...row, unitCost: 0, totalCost: '' }])[0].unitCost, 0);
  assert.throws(() => applyAccounting([row], [{ ...row, unitCost: -1 }]), /nonnegative/);
});
