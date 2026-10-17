import test from 'node:test';
import assert from 'node:assert/strict';
import { groupAccountItems, allocateAccountReturn } from './groupAccountItems.js';
const row = (id, extra = {}) => ({ rowKey: id, accountability: id, stockNumber: '015', description: 'Black', issuedAt: '2026-10-17T08:00:00+08:00', quantityIssued: 1, quantityReturned: 0, quantityRemaining: 1, documentNumber: 'ICS-1', ...extra });
test('same item and issuance day combine quantities but preserve return identities', () => {
  const [group] = groupAccountItems([row('a', { pendingReturn: true }), row('b'), row('c')]);
  assert.equal(group.quantityIssued, 3);
  assert.equal(group.quantityRemaining, 3);
  assert.equal(group.returnableQuantity, 2);
  assert.equal(group.pendingQuantity, 1);
  assert.equal(group.pendingReturn, false);
  assert.deepEqual(allocateAccountReturn(group, 2).map(entry => [entry.member.accountability, entry.quantity]), [['b', 1], ['c', 1]]);
  assert.throws(() => allocateAccountReturn(group, 3));
});
test('different issue days or stock identities remain separate', () => {
  assert.equal(groupAccountItems([row('a'), row('b', { issuedAt: '2026-10-18T08:00:00+08:00' }), row('c', { stockNumber: '016' })]).length, 3);
});
test('partial returns allocate only selected quantity across sources', () => {
  const [group] = groupAccountItems([row('a', { quantityRemaining: 3 }), row('b', { quantityRemaining: 2 })]);
  assert.deepEqual(allocateAccountReturn(group, 4).map(entry => entry.quantity), [3, 1]);
});
