import test from 'node:test';
import assert from 'node:assert/strict';
import { capitalizeFirstLetter, shouldCapitalizeField } from './capitalizeFormText.js';

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
