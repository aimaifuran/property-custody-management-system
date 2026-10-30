import test from 'node:test';
import assert from 'node:assert/strict';
import { userRecordItems, currentIssuedItems } from '../src/utils/userRecordItems.js';
import { groupAccountItems } from '../src/utils/groupAccountItems.js';

const report = (id, date, extra = {}) => ({
  _id: id, ptrNumber: id, date, direction: 'INCOMING', status: 'RECORDED',
  items: [{ returnSlip: 'prs', quantity: 2, description: 'Laptop', propertyNumber: '001' }], ...extra,
});

test('issued list excludes fully returned and transferred-out items while keeping partial and pending returns', () => {
  const rows = [
    { rowKey: 'returned', issued: true, quantityRemaining: 0, status: 'Successfully returned' },
    { rowKey: 'out', issued: true, quantityRemaining: 1, transferred: true },
    { rowKey: 'partial', issued: true, quantityRemaining: 1, quantityReturned: 1 },
    { rowKey: 'pending-return', issued: true, quantityRemaining: 2, pendingReturn: true },
    { rowKey: 'request', issued: false, quantityRemaining: 0 },
  ];
  assert.deepEqual(currentIssuedItems(rows).map(row => row.rowKey), ['partial', 'pending-return', 'request']);
  assert.equal(rows.length, 5, 'Filtering does not erase return history');
});

test('transfer documents without current custody never appear as issued items', () => {
  const rows = userRecordItems({ transferRecords: [report('PTR-1', '2026-10-01'), report('PTR-2', '2026-10-02'), report('PTR-3', '2026-10-02')] });
  assert.equal(rows.length, 0);
});

test('a transfer linked to another custodians asset creates no issued row', () => {
  const rows = userRecordItems({ assets: [], transferRecords: [report('PTR-1', '2026-10-01', {
    items: [{ accountability: 'other-account-asset', quantity: 1 }],
  })] });
  assert.equal(rows.length, 0);
});

test('outgoing, pending and rejected transfers never create issued receipts', () => {
  assert.equal(userRecordItems({ transferRecords: [
    report('OUT', '2026-10-01', { direction: 'OUTGOING' }),
    report('PENDING', '2026-10-01', { status: 'PENDING_ADMIN' }),
    report('REJECTED', '2026-10-01', { status: 'REJECTED' }),
  ] }).length, 0);
});

test('current transferred custody is listed once and remains returnable', () => {
  const rows = userRecordItems({ assets: [{
    _id: 'asset', quantity: 3, returnedQuantity: 1, formType: 'PAR',
    inventory: { item: { name: 'Laptop', stockNumber: '001' } },
    transferHistory: [{ ptr: 'PTR-NEW', date: '2026-10-20' }],
  }], transferRecords: [
    report('PTR-OLD', '2026-10-01', { items: [{ accountability: 'asset', quantity: 3 }] }),
    report('PTR-NEW', '2026-10-20', { items: [{ accountability: 'asset', quantity: 3 }] }),
  ] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].documentNumber, 'PTR-NEW');
  assert.equal(rows[0].issuedAt, '2026-10-20');
  assert.equal(rows[0].quantityRemaining, 2);
  assert.equal(groupAccountItems(rows)[0].returnableQuantity, 2);
});
