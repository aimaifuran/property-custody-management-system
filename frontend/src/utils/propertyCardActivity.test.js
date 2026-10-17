import test from 'node:test';
import assert from 'node:assert/strict';
import { propertyCardActivity } from './propertyCardActivity.js';
import { itemLedgerSelection, buildItemPropertyCardExport } from './itemPropertyCardExport.js';

const receipt = (id, balance) => ({ id, type: 'Receipt', date: '2026-10-14', received: 1, issued: 0, amount: 55, balance, source: { type: 'IAR', id: 'iar1' } });
const issue = (id, serial, balance) => ({ id, type: 'Issue', date: '2026-10-14', received: 0, issued: 1, amount: 55, balance, serialNumber: serial, inventory: id, office: 'Treasury', person: 'Employee', source: { type: 'RIS', id: 'ris1' }, accountabilityDocuments: [{ type: 'ICS', id: 'ics1' }] });

test('receipt-only Property Cards have no activity records or PDF rows', () => {
  const details = { transactions: [receipt('a', 1), receipt('b', 2)], summary: { openingBalance: 0 } };
  assert.deepEqual(propertyCardActivity(details.transactions), []);
  assert.deepEqual(itemLedgerSelection(details, { activityOnly: true }).rows, []);
  assert.equal(itemLedgerSelection(details, { activityOnly: true }).ending, 2);
  assert.deepEqual(buildItemPropertyCardExport(details, { activityOnly: true }).items, []);
});

test('serialized units are one issuance document record with original stock balance', () => {
  const transactions = [receipt('a', 1), receipt('b', 2), issue('u1', '45241-1', 1), issue('u2', '45241-2', 0)];
  const rows = propertyCardActivity(transactions);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].issued, 2);
  assert.equal(rows[0].amount, 110);
  assert.equal(rows[0].balance, 0);
  assert.deepEqual(rows[0].serialNumbers, ['45241-1', '45241-2']);
  assert.equal(rows[0].accountabilityDocuments.length, 1);
  assert.equal(transactions.length, 4, 'Original stock ledger remains intact');
  assert.equal(transactions[2].balance, 1);
});

test('returns and transfers follow issuance while unrelated documents stay separate', () => {
  const transactions = [receipt('a', 1), { id: 'early', type: 'Transfer', balance: 1 }, issue('u1', 'SERIAL', 0),
    { id: 'return', type: 'Return', received: 1, balance: 1, amount: 55, source: { type: 'PRS', id: 'prs1' } },
    { ...issue('u2', 'SERIAL', 0), source: { type: 'RIS', id: 'ris2' } }];
  const rows = propertyCardActivity(transactions);
  assert.deepEqual(rows.map(row => row.type), ['Issue', 'Return', 'Issue']);
  assert.deepEqual(rows.map(row => row.balance), [0, 1, 0]);
  const filtered = itemLedgerSelection({ transactions, summary: { openingBalance: 0 } }, { activityOnly: true, office: 'Treasury', type: 'Issue' });
  assert.equal(filtered.rows.length, 2);
  assert.deepEqual(filtered.rows.map(row => row.balance), [0, 0]);
});

test('20 received and three approved one-unit issuances show actual remaining stock', () => {
  const transactions = [
    ...Array.from({ length: 20 }, (_, i) => receipt(`receipt${i}`, i + 1)),
    ...Array.from({ length: 3 }, (_, i) => ({ ...issue(`issue${i}`, `SERIAL-${i}`, 19 - i), source: { type: 'RIS', id: `ris${i}` } })),
  ];
  const details = { transactions, summary: { openingBalance: 0, currentBalance: 17, availableStock: 17 } };
  const selection = itemLedgerSelection(details, { activityOnly: true });
  assert.equal(selection.initialStock, 20);
  assert.equal(selection.beginning, 20);
  assert.equal(selection.ending, 17);
  assert.deepEqual(selection.rows.map(row => row.balance), [19, 18, 17]);
  const exportData = buildItemPropertyCardExport(details, { activityOnly: true });
  assert.equal(exportData.items[0].balanceQuantity, 20);
  assert.equal(exportData.items.at(-1).balanceQuantity, 17);
  const filtered = itemLedgerSelection(details, { activityOnly: true, office: 'Treasury', type: 'Issue' });
  assert.equal(filtered.beginning, 20);
  assert.equal(filtered.ending, 17);
  const dated = itemLedgerSelection(details, { activityOnly: true, from: '2026-10-15' });
  assert.equal(dated.beginning, 17, 'Date-specific opening remains the stock before that period');
});
