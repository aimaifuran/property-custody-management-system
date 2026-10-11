import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRowData } from '../src/utils/formRows.js';
import { collectFormErrors } from '../src/utils/formValidation.js';

test('unused rows are ignored while partial input and explicit zero costs are retained', () => {
  const blank = { description: '', quantity: '', unitCost: '', totalCost: 0 };
  assert.equal(hasRowData({ ...blank }, blank), false);
  assert.equal(hasRowData({ ...blank, description: '   ' }, blank), false);
  assert.equal(hasRowData({ ...blank, description: 'Laptop' }, blank), true);
  assert.equal(hasRowData({ ...blank, quantity: '1' }, blank), true);
  assert.equal(hasRowData({ ...blank, unitCost: 0 }, blank), true);
  const rows = [{ ...blank, description: 'Laptop' }, { ...blank }];
  assert.equal(rows.filter(row => hasRowData(row, blank)).length, 1);
});

test('empty optional quantities pass but required and nonpositive quantities fail', () => {
  const field = { willValidate: true, readOnly: false, required: false, value: '', dataset: { positive: 'true' }, validity: { valid: true }, matches: () => false, getAttribute: () => 'Quantity', closest: () => null };
  assert.deepEqual(collectFormErrors({ elements: [field] }), []);
  field.required = true;
  assert.equal(collectFormErrors({ elements: [field] })[0].message, 'This field is required.');
  field.value = '0';
  assert.equal(collectFormErrors({ elements: [field] })[0].message, 'Enter a number greater than zero.');
  field.value = '2';
  assert.deepEqual(collectFormErrors({ elements: [field] }), []);
});
