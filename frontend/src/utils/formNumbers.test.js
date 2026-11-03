import test from 'node:test';
import assert from 'node:assert/strict';
import { formNumber, formNumberValue, formNumberData } from './formNumbers.js';

test('forms hide generated property identities and strip generated stock suffixes', () => {
  assert.equal(formNumber('P-6AE97C1604AB708447234369'), '');
  assert.equal(formNumber('001~6ae999c2501a123456789abc'), '001');
  for (const manual of ['001', 'PROP-001', 'INV-2026-001', 'P-12345']) assert.equal(formNumber(manual), manual);
  assert.equal(formNumber(null), '');
  assert.equal(formNumberValue('description', 'P-6AE97C1604AB708447234369'), 'P-6AE97C1604AB708447234369');
});

test('exports sanitize nested form numbers without changing source links or source records', () => {
  const source = { iarNumber: '025', propertyNumber: 'P-6AE97C1604AB708447234369', items: [
    { stockNumber: '001~6ae999c2501a123456789abc', displayStockNumber: '008', inventory: '6ae999c2501a123456789abc', inventoryItemNo: 'ADMIN-001' },
  ] };
  const output = formNumberData(source);
  assert.equal(output.propertyNumber, '');
  assert.equal(output.items[0].stockNumber, '008');
  assert.equal(output.items[0].inventory, source.items[0].inventory);
  assert.equal(output.items[0].inventoryItemNo, 'ADMIN-001');
  assert.equal(output.iarNumber, '025');
  assert.equal(source.propertyNumber, 'P-6AE97C1604AB708447234369');
  assert.equal(source.items[0].stockNumber, '001~6ae999c2501a123456789abc');
});
