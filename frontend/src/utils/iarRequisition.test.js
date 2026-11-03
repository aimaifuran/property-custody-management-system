import test from 'node:test';
import assert from 'node:assert/strict';
import { iarRequisitionRows, matchingIarDraftIds } from './iarRequisition.js';

const stock = { stockNumber: '001~6ae999c2501a123456789abc', quantityOnHand: 3, unit: 'pcs', cost: 100, fundCluster: 'General', responsibilityCenterCode: 'Supply' };
const draft = { _id: 'row1', iarId: 'iar1', stockNumber: stock.stockNumber, stockPropertyNumber: '001', inventory: 'unit1', description: 'office chair', quantity: 1 };

test('selected IAR items populate separate requisition rows with original stock numbers and exact units', () => {
  const rows = iarRequisitionRows([draft, { ...draft, _id: 'row2', inventory: 'unit2', unitCost: 250 }], [stock]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.inventory), ['unit1', 'unit2']);
  assert.deepEqual(rows.map(row => row.displayStockNumber), ['001', '001']);
  assert.deepEqual(rows.map(row => row.quantityRequested), [1, 1]);
  assert.deepEqual(rows.map(row => row.totalCost), [100, 250]);
  assert.equal(rows[0].description, 'Office Chair');
  assert.equal(rows[0].unit, 'PCS');
  assert.equal(rows[0].fundCluster, 'General');
});

test('multiple selections share the remaining stock and reject unavailable items', () => {
  const rows = iarRequisitionRows([{ ...draft, quantity: 2 }, { ...draft, inventory: 'unit2', quantity: 2 }], [stock]);
  assert.deepEqual(rows.map(row => row.quantityIssued), [2, 1]);
  assert.throws(() => iarRequisitionRows([draft], []), /no longer available/);
  assert.throws(() => iarRequisitionRows([draft], [{ ...stock, quantityOnHand: 0 }]), /no available stock/);
});

test('items from different fund clusters or responsibility centers cannot share one RIS', () => {
  assert.throws(() => iarRequisitionRows([draft, { ...draft, fundCluster: 'Trust' }], [stock]), /same Fund Cluster/);
  assert.throws(() => iarRequisitionRows([draft, { ...draft, responsibilityCenterCode: 'Treasury' }], [stock]), /same Responsibility Center/);
});

test('manual requisition selection checks only its exact IAR receipt unit', () => {
  const drafts = [
    { ...draft, _id: 'first', inventory: 'unit1', inventories: ['unit1', 'unit2'] },
    { ...draft, _id: 'second', inventory: 'unit3' },
  ];
  assert.deepEqual(matchingIarDraftIds({ stockNumber: stock.stockNumber, inventory: { _id: 'unit2' } }, drafts), ['first']);
  assert.deepEqual(matchingIarDraftIds({ stockNumber: stock.stockNumber, inventory: 'unit3' }, drafts), ['second']);
  assert.deepEqual(matchingIarDraftIds({ itemName: 'Unknown item' }, drafts), []);
  assert.deepEqual(matchingIarDraftIds({ stockNumber: stock.stockNumber, inventory: 'unrelated' }, drafts), []);
});
