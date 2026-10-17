import test from 'node:test';
import assert from 'node:assert/strict';
import { createRisRow, risDraftRows, risItemChoices, selectRisItem, setRisRequestedQuantity } from './risItemSelection.js';
import { iarFormData } from './iarFormData.js';

const stock = { _id: 'paper', name: 'Bondpaper', stockNumber: 'PAPER', unit: 'ream', description: 'A4 white', quantityOnHand: 2, hasTrackedUnits: true, units: [{ _id: 'unit1', serialNumber: '45241-1', unitCost: 200 }, { _id: 'unit2', serialNumber: '45241-2', unitCost: 200 }] };
test('blank rows select by name and allocate distinct available units without adding rows', () => {
  const rows = [createRisRow(), createRisRow(), createRisRow()];
  assert.equal(rows[0].stockNumber, '');
  let choices = risItemChoices([stock], rows, 0);
  assert.deepEqual(choices.map(row => row.name), ['Bondpaper']);
  rows[0] = selectRisItem(rows[0], choices[0]);
  assert.equal(rows[0].serialNumber, '45241-1');
  assert.equal(rows[0].quantityRequested, '');
  assert.equal(rows[0].quantityIssued, '');
  choices = risItemChoices([stock], rows, 1);
  rows[1] = selectRisItem(rows[1], choices[0]);
  assert.equal(rows[1].serialNumber, '45241-2');
  assert.equal(rows.length, 3);
  assert.deepEqual(risItemChoices([stock], rows, 2), []);
  rows[0] = selectRisItem(rows[0], null);
  assert.equal(risItemChoices([stock], rows, 2)[0].candidates[0].unit._id, 'unit1');
});

test('requested quantity drives proposed actual quantity rather than defaulting to one', () => {
  const selected = selectRisItem(createRisRow(), risItemChoices([stock], [createRisRow()], 0)[0]);
  let row = setRisRequestedQuantity(selected, '3', 20);
  assert.equal(row.quantityRequested, '3');
  assert.equal(row.quantityIssued, 3);
  row = setRisRequestedQuantity(row, '5', 20);
  assert.equal(row.quantityIssued, 5);
  row = setRisRequestedQuantity(row, '30', 20);
  assert.equal(row.quantityRequested, '30');
  assert.equal(row.quantityIssued, 20, 'Actual quantity is capped by available stock, not by a single serial');
  assert.equal(setRisRequestedQuantity(row, '', 20).quantityIssued, '');
  assert.equal(setRisRequestedQuantity(row, '3', 20, true).quantityIssued, '', 'A user request does not authorize issuance');
});

test('multiple request rows account for the full quantity requested on other rows', () => {
  const stocks = [{ ...stock, quantityOnHand: 20, units: Array.from({ length: 20 }, (_, i) => ({ _id: `unit${i}`, serialNumber: `SERIAL-${i}` })) }];
  const first = setRisRequestedQuantity(selectRisItem(createRisRow(), risItemChoices(stocks, [createRisRow()], 0)[0]), '3', 20);
  const choices = risItemChoices(stocks, [first, createRisRow()], 1);
  assert.equal(choices[0].candidates[0].available, 17);
});
test('group names across stock codes without exposing serials, codes or descriptions', () => {
  const duplicate = { ...stock, _id: 'paper2', stockNumber: 'OTHER', name: 'bondpaper', units: [{ _id: 'unit3', serialNumber: 'OTHER-1' }] };
  const choices = risItemChoices([stock, duplicate], [createRisRow()], 0);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].name, 'Bondpaper');
  assert.equal(choices[0].candidates.length, 2);
  assert.deepEqual(risItemChoices([{ ...stock, units: [] }], [createRisRow()], 0), []);
});
test('IAR selection shares headers but leaves RIS item row blank', () => {
  const form = iarFormData({ _id: 'iar1', fundCluster: 'General Fund', items: [{ inventory: 'unit1', serialNumber: '45241', description: 'Paper', quantity: 10 }] }, 'ris');
  assert.equal(form.iar, 'iar1');
  assert.equal(form.fundCluster, 'General Fund');
  assert.deepEqual(form.items, [createRisRow()]);
});

test('untouched legacy receipt drafts open blank while edited requests retain their selections', () => {
  const record = { status: 'DRAFT', iar: 'iar', createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', items: [{ stockNumber: 'PAPER', inventory: 'unit1', quantityIssued: null }] };
  assert.deepEqual(risDraftRows(record), [createRisRow()]);
  assert.deepEqual(risDraftRows({ ...record, updatedAt: '2026-10-14T01:00:00Z' }), record.items);
  assert.deepEqual(risDraftRows({ ...record, requestedBy: { user: 'employee' } }), record.items);
  assert.deepEqual(risDraftRows({ ...record, status: 'ACCOUNTABILITY_LOCKED' }), record.items);
});

test('out-of-stock names disappear after refreshed stock and return only when restocked', () => {
  const rows = [createRisRow()];
  assert.equal(risItemChoices([stock], rows, 0).length, 1);
  for (const quantityOnHand of [0, -1, undefined, 'invalid']) {
    assert.deepEqual(risItemChoices([{ ...stock, quantityOnHand }], rows, 0), []);
  }
  assert.deepEqual(risItemChoices([{ ...stock, units: [] }], rows, 0), []);
  assert.equal(risItemChoices([{ ...stock, quantityOnHand: 1 }], rows, 0)[0].name, 'Bondpaper');
});

test('selected items inherit their exact IAR fund and other rows cannot mix funds', async () => {
  const { risSelectedFunds } = await import('./risItemSelection.js');
  const general = { ...stock, fundCluster: 'Trust Fund', units: [{ _id: 'gf-unit', fundCluster: 'General Fund' }, { _id: 'tf-unit', fundCluster: 'Trust Fund' }] };
  const broom = { ...stock, stockNumber: 'BROOM', name: 'Broom', fundCluster: 'Trust Fund', units: [{ _id: 'broom-unit', fundCluster: 'Trust Fund' }] };
  const rows = [createRisRow(), createRisRow()];
  const choice = risItemChoices([general], rows, 0)[0];
  assert.equal(choice.candidates[0].available, 1, 'Quantity excludes units from another fund');
  rows[0] = selectRisItem(rows[0], choice);
  assert.equal(rows[0].fundCluster, 'General Fund', 'Exact unit wins over the latest stock receipt');
  assert.deepEqual(risSelectedFunds(rows, [general]), ['General Fund']);
  assert.deepEqual(risItemChoices([broom], rows, 1), [], 'Different fund is excluded from the next row');
  assert.equal(risItemChoices([broom], [createRisRow()], 0)[0].name, 'Broom');
});
