import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAccountItems, mergeAccountItems, returnSubmission } from '../src/utils/accountItems.js';

const baseRow = {
  risId: 'ris-1', itemId: 'line-1', risNumber: 'RIS-001',
  description: 'Laptop', quantityIssued: 2, quantityRequested: 2,
  formType: 'PAR', documentNumber: 'PAR-OLD', issued: true,
  quantityRemaining: 2, quantityReturned: 0, returns: [],
};
const asset = {
  _id: 'asset-1', ris: 'ris-1', risItem: 'line-1', user: 'recipient',
  quantity: 2, returnedQuantity: 0, quantityRemaining: 2,
  formType: 'PAR', documentNumber: 'PAR-CURRENT', issuanceForm: 'form-current',
  issueDate: '2026-10-01T00:00:00Z',
  inventory: { unitCost: 60000, item: { stockNumber: 'LAPTOP', description: 'Laptop', unit: 'piece' } },
};
const slip = (number, quantity, status = 'RETURNED', overrides = {}) => ({
  prsNumber: number, status, createdAt: '2026-10-08T00:00:00Z',
  returnedTo: { date: '2026-10-08T01:00:00Z', name: 'Receiving Officer' },
  items: [{ accountability: 'asset-1', ris: 'ris-1', risItem: 'line-1', description: 'Laptop', mrNumber: 'PAR-CURRENT', unitValue: 60000, quantity }],
  ...overrides,
});

test('owned assets replace their RIS row once and deduplicate return receipts', () => {
  const report = slip('PRS-001', 1);
  const rows = mergeAccountItems({
    risRows: [{ ...baseRow, returns: [{ prsNumber: 'PRS-001', quantity: 1, status: 'RETURNED' }] }],
    assets: [{ ...asset, returnedQuantity: 1, quantityRemaining: 1 }], returnSlips: [report],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].documentNumber, 'PAR-CURRENT');
  assert.equal(rows[0].formId, 'form-current');
  assert.equal(rows[0].quantityIssued, 2);
  assert.equal(rows[0].quantityReturned, 1);
  assert.equal(rows[0].quantityRemaining, 1);
  assert.equal(rows[0].returns.length, 1);
  assert.equal(rows[0].status, 'Partially returned');
});

test('transferred assets appear for the receiver and exclude earlier custody-period returns from totals', () => {
  const rows = mergeAccountItems({
    assets: [{ ...asset, quantity: 10, returnedQuantity: 7, quantityRemaining: 3, transferHistory: [{ to: 'recipient', date: '2026-10-05T00:00:00Z' }] }],
    returnSlips: [slip('PRS-OWN-CURRENT', 1), slip('PRS-OWN-EARLIER', 2, 'RETURNED', { createdAt: '2026-10-03T00:00:00Z' })],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantityRequested, null);
  assert.equal(rows[0].quantityIssued, 4);
  assert.equal(rows[0].quantityReturned, 1);
  assert.equal(rows[0].quantityRemaining, 3);
  assert.equal(rows[0].returns.length, 1);
  assert.equal(rows[0].transferred, false);
  assert.equal(rows[0].documentNumber, 'PAR-CURRENT');
});

test('pending or rejected receipts do not reduce return quantities', () => {
  const rows = mergeAccountItems({
    assets: [{ ...asset, pendingMovement: 'PRS:pending', transferHistory: [{ date: '2026-10-05T00:00:00Z' }] }],
    returnSlips: [slip('PRS-PENDING', 1, 'PENDING'), slip('PRS-REJECTED', 1, 'REJECTED')],
  });
  assert.equal(rows[0].pendingReturn, true);
  assert.equal(rows[0].status, 'Awaiting admin confirmation');
  assert.equal(rows[0].quantityIssued, 2);
  assert.equal(rows[0].quantityReturned, 0);
  assert.equal(rows[0].quantityRemaining, 2);
});

test('final return history survives removal of the active asset without inventing its original issuance total', () => {
  const returnSlips = [slip('PRS-FINAL', 2)];
  const fresh = mergeAccountItems({ returnSlips });
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].historyOnly, true);
  assert.equal(fresh[0].quantityIssued, null);
  assert.equal(fresh[0].quantityReturned, 2);
  assert.equal(fresh[0].quantityRemaining, 0);
  assert.equal(fresh[0].documentNumber, 'PAR-CURRENT');
  assert.equal(fresh[0].status, 'Receipt confirmed');
  assert.equal(fresh[0].returns[0].receivedBy, 'Receiving Officer');

  const previousRows = mergeAccountItems({ assets: [asset] });
  const confirmed = mergeAccountItems({ returnSlips, previousRows });
  assert.equal(confirmed[0].quantityIssued, 2);
  assert.equal(confirmed[0].status, 'Successfully returned');
});

test('a former owner has no actionable transferred asset and ordinary confirmed return history remains complete', () => {
  const sender = mergeAccountItems({ risRows: [{ ...baseRow, transferred: true, quantityRemaining: 0 }], returnSlips: [slip('PRS-PARTIAL-BEFORE-TRANSFER', 1)] });
  assert.equal(sender.length, 1);
  assert.equal(sender[0].transferred, true);
  assert.equal(sender[0].quantityRemaining, 0);
  assert.equal(sender[0].accountability, undefined);

  const complete = mergeAccountItems({ risRows: [{ ...baseRow, quantityRemaining: 0, quantityReturned: 2, status: 'Successfully returned' }], returnSlips: [slip('PRS-FINAL', 2)] });
  assert.equal(complete[0].status, 'Successfully returned');
  assert.equal(complete[0].quantityIssued, 2);
});

test('legacy assets and return history without RIS links remain separate by accountability ID', () => {
  const first = { ...asset, _id: 'legacy-1', ris: undefined, risItem: undefined };
  const second = { ...asset, _id: 'legacy-2', ris: undefined, risItem: undefined, documentNumber: 'PAR-SECOND' };
  const active = mergeAccountItems({ assets: [first, second] });
  assert.equal(active.length, 2);
  assert.deepEqual(active.map(row => row.rowKey), ['asset:legacy-1', 'asset:legacy-2']);
  const returns = [first, second].map((row, index) => slip(`PRS-LEGACY-${index}`, 2, 'RETURNED', { items: [{ accountability: row._id, quantity: 2, description: `Legacy asset ${index}`, mrNumber: row.documentNumber, unitValue: 60000 }] }));
  const history = mergeAccountItems({ returnSlips: returns });
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(row => row.rowKey), ['asset:legacy-1', 'asset:legacy-2']);
});

test('the shared loader uses scoped reads and existing submit chooses custody for assets, RIS for supplies', async () => {
  const paths = [];
  const client = { get: async path => { paths.push(path); return { data: { data: [] } }; } };
  assert.deepEqual(await loadAccountItems(client, '/ris/my-items'), { risRows: [], assets: [], returnSlips: [] });
  assert.deepEqual(paths, ['/ris/my-items', '/custody/assets', '/custody/returns']);
  assert.deepEqual(returnSubmission({ accountability: 'asset-1', risId: 'other-owner', itemId: 'line-1' }, '1'), { path: '/custody/returns', body: { accountability: 'asset-1', quantity: '1' } });
  assert.deepEqual(returnSubmission({ risId: 'ris-supply', itemId: 'line-supply' }, 2), { path: '/ris/my-returns', body: { risId: 'ris-supply', itemId: 'line-supply', quantity: 2 } });
});
