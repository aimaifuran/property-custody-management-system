import test from 'node:test';
import assert from 'node:assert/strict';
import { capitalizeFirstLetter, shouldCapitalizeField, formatItemText } from './capitalizeFormText.js';

test('capitalize initial text while preserving remaining text and identifiers', () => {
  assert.equal(capitalizeFirstLetter('  bondpaper A4'), '  Bondpaper A4');
  assert.equal(capitalizeFirstLetter('HP laptop'), 'HP laptop');
  assert.equal(capitalizeFirstLetter('45241'), '45241');
  assert.ok(shouldCapitalizeField({ hint: 'Description' }));
  assert.ok(shouldCapitalizeField({ hint: 'Property, Plant and Equipment' }));
  for (const hint of ['Base Serial Number', 'S/N', 'Stock/Property No.', 'Item Code', 'Username', 'Email', 'Reference PAR No.']) {
    assert.equal(shouldCapitalizeField({ hint }), false, hint);
  }
  assert.equal(shouldCapitalizeField({ type: 'password' }), false);
  assert.equal(shouldCapitalizeField({ type: 'number' }), false);
});

test('item fields and RIS purpose keep the requested capitalization', () => {
  assert.equal(formatItemText('serialNumber', 'sn-ab123'), 'SN-AB123');
  assert.equal(formatItemText('unit', 'pcs'), 'PCS');
  assert.equal(formatItemText('description', '  office  table\nwith USB ports'), '  Office  Table\nWith USB Ports');
  assert.equal(formatItemText('purpose', 'for office use'), 'FOR OFFICE USE');
  assert.equal(formatItemText('stockPropertyNumber', 'abc-001'), 'abc-001');
  assert.equal(formatItemText('unit', undefined), undefined);
});
