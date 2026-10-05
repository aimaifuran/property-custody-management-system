const test = require('node:test');
const assert = require('node:assert/strict');
const { monthOf, collectMonthlyItems, recapitulate } = require('../src/utils/monthlyItems');

const date = '2026-10-05T02:00:00Z';
const item = { description: 'Printer', stockNumber: 'IT-001', unit: 'UNIT', quantity: 2, unitCost: 1500 };
test('recorded dates respect Manila month boundaries', () => {
  assert.equal(monthOf('2026-09-30T16:00:00Z'), '2026-10');
  assert.equal(monthOf('2026-09-30T15:59:59Z'), '2026-09');
  assert.equal(monthOf(null), '');
});
test('IAR items appear once despite automatically created records and item catalog entries', () => {
  const sources = {
    iar: [{ _id: 'iar1', createdAt: date, items: [item] }],
    ris: [{ _id: 'ris1', iar: 'iar1', createdAt: date, risNumber: 'RIS-01', items: [{ ...item, quantityRequested: 2 }] }],
    ics: [{ _id: 'ics1', iar: 'iar1', createdAt: date, items: [item] }],
    par: [{ _id: 'par1', iar: 'iar1', createdAt: date, items: [item] }],
    cards: [{ _id: 'card1', iar: 'iar1', createdAt: date, items: [item] }],
    inventory: [{ _id: 'inv1', inspectionAcceptanceReport: 'iar1', item: { _id: 'item1', ...item }, createdAt: date }],
    items: [{ _id: 'item1', ...item, createdAt: date, quantityOnHand: 2 }],
  };
  const rows = collectMonthlyItems(sources).get('2026-10');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].risNumber, 'RIS-01');
  assert.equal(rows[0].unitCost, 1500);
});
test('standalone inventory, RIS, item catalog, and returned items are included', () => {
  const rows = collectMonthlyItems({
    inventory: [{ _id: 'inv1', createdAt: date, quantity: 4, unitCost: 10, item: { _id: 'catalog1', description: 'Paper', stockNumber: 'P1', unit: 'REAM' } }],
    items: [{ _id: 'catalog1', createdAt: date, stockNumber: 'P1', description: 'Paper', unit: 'REAM', cost: 10, quantityOnHand: 4 }, { _id: 'catalog2', createdAt: date, stockNumber: 'P2', description: 'Pen', unit: 'PC', cost: 3, quantityOnHand: 5 }],
    ris: [{ _id: 'ris2', createdAt: date, items: [{ description: 'Ink', unit: 'BTL', quantityIssued: 2, totalCost: 40 }] }],
    prs: [{ _id: 'prs1', createdAt: date, items: [{ description: 'Chair', unit: 'PC', quantity: 1, unitValue: 30 }] }],
    returned: [{ _id: 'ret1', prs: 'prs1', createdAt: date, description: 'Chair', unit: 'PC', quantity: 1 }, { _id: 'ret2', createdAt: date, description: 'Table', unit: 'PC', quantity: 1 }],
  }).get('2026-10');
  assert.equal(rows.length, 5);
  assert.equal(rows.find(row => row.item === 'Ink').unitCost, 20);
  assert.equal(rows.filter(row => row.item === 'Chair').length, 1);
});
test('source edits, deletions, and different months rebuild the report without stale or duplicate rows', () => {
  const record = { _id: 'iar1', createdAt: date, items: [item] };
  assert.equal(collectMonthlyItems({ iar: [record] }).get('2026-10')[0].quantity, 2);
  record.items = [{ ...item, quantity: 5 }];
  assert.equal(collectMonthlyItems({ iar: [record] }).get('2026-10')[0].quantity, 5);
  record.deleted = true;
  assert.equal(collectMonthlyItems({ iar: [record] }).size, 0);
  assert.deepEqual([...collectMonthlyItems({ iar: [{ ...record, deleted: false, createdAt: '2026-09-01T00:00:00Z' }] }).keys()], ['2026-09']);
});
test('recapitulation combines matching items while preserving distinct costs and blank costs', () => {
  const rows = [{ item: 'Paper', unit: 'REAM', stockNumber: 'P1', quantity: 2, unitCost: 10 }, { item: 'Paper', unit: 'REAM', stockNumber: 'P1', quantity: 3, unitCost: 10 }, { item: 'Paper', unit: 'REAM', stockNumber: 'P1', quantity: 1, unitCost: 12 }, { item: 'Chair', unit: 'PC', stockNumber: '', quantity: 1, unitCost: null }];
  const summary = recapitulate(rows);
  assert.equal(summary.length, 3);
  assert.equal(summary.find(row => row.unitCost === 10).quantity, 5);
  assert.equal(summary.find(row => row.unitCost === 10).totalCost, 50);
  assert.equal(summary.find(row => row.item === 'Chair').totalCost, null);
});
