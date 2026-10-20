const test = require('node:test');
const assert = require('node:assert/strict');
test('print and PDF use the same selected item, period and ledger balances', async () => {
  const { buildItemPropertyCardExport, itemLedgerSelection } = await import('../../frontend/src/utils/itemPropertyCardExport.js');
  const details = { exportHeader: { propertyNumber: 'PAPER', description: 'Bond paper', entityName: 'Carigara' }, summary: { openingBalance: 0 }, transactions: [
    { date: '2026-10-13T15:00:00Z', type: 'Receipt', reference: 'IAR-1', received: 10, issued: 0, balance: 10, amount: 2000, remarks: 'Accepted', office: '' },
    { date: '2026-10-13T17:00:00Z', type: 'Issue', reference: 'RIS-1', received: 0, issued: 3, balance: 7, amount: 600, remarks: 'Issued', office: 'Mayor Office', person: 'Catherine Lagera' },
    { date: '2026-10-15T01:00:00Z', type: 'Return', reference: 'PRS-1', received: 1, issued: 0, balance: 8, amount: 200, remarks: 'Serviceable', office: 'Treasury' },
  ] };
  const selection = itemLedgerSelection(details, { from: '2026-10-14', to: '2026-10-14', type: 'Issue' });
  assert.equal(selection.beginning, 10);
  assert.equal(selection.ending, 7);
  assert.equal(selection.rows.length, 1);
  const payload = buildItemPropertyCardExport(details, { from: '2026-10-14', to: '2026-10-14', type: 'Issue' });
  assert.equal(payload.propertyNumber, 'PAPER');
  assert.equal(payload.items[0].balanceQuantity, 10);
  assert.equal(payload.items[1].referenceParNo, 'RIS-1');
  assert.equal(payload.items[1].itdQuantity, 3);
  assert.equal(payload.items[1].amount, 600);
  assert.equal(payload.items[1].itdOfficeOfficer, 'Catherine Lagera');
  assert.equal(payload.items[0].remarks, '');
  assert.equal(payload.items[1].remarks, 'Issued');
  assert.equal(payload.items.at(-1).remarks, '');
  details.transactions[1].remarks = '';
  assert.equal(buildItemPropertyCardExport(details, { type: 'Issue' }).items[1].remarks, '');
  assert.equal(payload.items.at(-1).balanceQuantity, 7);
  assert.equal(details.transactions.length, 3);
});
