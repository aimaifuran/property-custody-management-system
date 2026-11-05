const test = require('node:test');
const assert = require('node:assert/strict');
const { monthOf, collectMonthlyItems, recapitulate, iarRows } = require('../src/utils/monthlyItems');

const date = '2026-10-05T02:00:00Z';
const item = { description: 'Printer', stockNumber: 'IT-001', unit: 'UNIT', quantity: 2, unitCost: 1500 };

test('older saved reports retain only IAR rows and their manual accounting values', () => {
  const rows = iarRows([
    { source: 'IAR', stockNumber: '001~6ae999c2501a123456789abc', accountingManual: true, unitCost: 17, totalCost: 99 },
    { source: 'RIS', stockNumber: '001' },
    { source: 'PAR', stockNumber: '001' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stockNumber, '001');
  assert.equal(rows[0].unitCost, 17);
  assert.equal(rows[0].totalCost, 99);
});
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
  assert.equal(rows[0].risNumber, '');
  assert.equal(rows[0].unitCost, null);
});
test('standalone inventory, RIS, item catalog, and returned items are excluded', () => {
  const rows = collectMonthlyItems({
    inventory: [{ _id: 'inv1', createdAt: date, quantity: 4, unitCost: 10, item: { _id: 'catalog1', description: 'Paper', stockNumber: 'P1', unit: 'REAM' } }],
    items: [{ _id: 'catalog1', createdAt: date, stockNumber: 'P1', description: 'Paper', unit: 'REAM', cost: 10, quantityOnHand: 4 }, { _id: 'catalog2', createdAt: date, stockNumber: 'P2', description: 'Pen', unit: 'PC', cost: 3, quantityOnHand: 5 }],
    ris: [{ _id: 'ris2', createdAt: date, items: [{ description: 'Ink', unit: 'BTL', quantityIssued: 2, totalCost: 40 }] }],
    prs: [{ _id: 'prs1', createdAt: date, items: [{ description: 'Chair', unit: 'PC', quantity: 1, unitValue: 30 }] }],
    returned: [{ _id: 'ret1', prs: 'prs1', createdAt: date, description: 'Chair', unit: 'PC', quantity: 1 }, { _id: 'ret2', createdAt: date, description: 'Table', unit: 'PC', quantity: 1 }],
  }).get('2026-10');
  assert.equal(rows, undefined);
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
test('recapitulation combines quantities regardless of cost and leaves both costs blank', () => {
  const rows = [{ item: 'Paper', unit: 'REAM', stockNumber: 'P1', quantity: 2, unitCost: 10 }, { item: 'Paper', unit: 'REAM', stockNumber: 'P1', quantity: 3, unitCost: 10 }, { item: 'Paper', unit: 'REAM', stockNumber: 'P1', quantity: 1, unitCost: 12 }, { item: 'Chair', unit: 'PC', stockNumber: '', quantity: 1, unitCost: null }];
  const summary = recapitulate(rows);
  assert.equal(summary.length, 2);
  assert.equal(summary.find(row => row.item === 'Paper').quantity, 6);
  assert.ok(summary.every(row => row.unitCost === null && row.totalCost === null));
  assert.equal(rows[0].unitCost, 10);
  assert.equal(summary.find(row => row.item === 'Chair').totalCost, null);
});

test('only IAR rows are collected and original stock numbers have no catalog suffix', () => {
  const sources = { iar: [{ _id: 'iar1', createdAt: date, responsibilityCenterCode: 'Supply', items: [
    { ...item, stockNumber: '001~6ae999c2501a123456789abc', stockPropertyNumber: '001' },
    { ...item, stockNumber: '002~6ae999c2501a123456789abc' },
  ] }] };
  for (const type of ['ris', 'ics', 'par', 'cards', 'inventory', 'ptr', 'prs', 'returned', 'items', 'properties']) {
    sources[type] = [{ _id: type, createdAt: date, description: 'Other form', propertyName: 'Other form', items: [item] }];
  }
  const rows = collectMonthlyItems(sources).get('2026-10');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.stockNumber), ['001', '002']);
  assert.ok(rows.every(row => row.source === 'IAR' && row.responsibilityCenter === 'Supply'));
});

test('a dash responsibility center is shown as blank in monthly reports', () => {
  const rows = collectMonthlyItems({ iar: [{ _id: 'iar1', createdAt: date, responsibilityCenterCode: '-', items: [item] }] }).get('2026-10');
  assert.equal(rows[0].responsibilityCenter, '');
});

test('issued RIS numbers enrich exact IAR items without adding rows or changing receipt quantities', () => {
  const receipt = { _id: 'iar1', createdAt: date, items: [
    { ...item, inventory: 'inv1', inventories: ['inv1', 'inv2'], quantity: 5 },
    { ...item, inventory: 'inv3' },
  ] };
  const ris = (risNumber, status, inventory, quantityIssued = 1) => ({ risNumber, status, items: [{ inventory, quantityIssued, stockNumber: item.stockNumber }] });
  const rows = collectMonthlyItems({ iar: [receipt], ris: [
    ris('RIS-001', 'ISSUED', 'inv1'), ris('RIS-001', 'ISSUED', 'inv2'),
    ris('RIS-002', 'ACCOUNTABILITY_LOCKED', 'inv2'), ris('RIS-DRAFT', 'DRAFT', 'inv3'),
    ris('RIS-APPROVED', 'APPROVED', 'inv3'), ris('RIS-ZERO', 'ISSUED', 'inv3', 0),
    { ...ris('RIS-DELETED', 'ISSUED', 'inv3'), deleted: true },
    ris('RIS-OTHER', 'ISSUED', 'other-inventory'),
  ] }).get('2026-10');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].risNumber, 'RIS-001, RIS-002');
  assert.equal(rows[0].quantity, 5);
  assert.equal(rows[1].risNumber, '');
  assert.ok(rows.every(row => row.source === 'IAR'));
});

test('legacy RIS references match only within the linked IAR and matching stock', () => {
  const rows = collectMonthlyItems({
    iar: [{ _id: 'iar1', createdAt: date, items: [item] }, { _id: 'iar2', createdAt: date, items: [item] }],
    ris: [{ iar: 'iar1', risNumber: 'RIS-001', status: 'ISSUED', items: [{ stockNumber: item.stockNumber, quantityIssued: 1 }] }],
  }).get('2026-10');
  assert.deepEqual(rows.map(row => row.risNumber), ['RIS-001', '']);
});
