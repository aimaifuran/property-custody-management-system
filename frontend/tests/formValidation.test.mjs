import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFormErrors } from '../src/utils/formValidation.js';

const field = (overrides = {}) => ({
  willValidate: true, required: true, value: '', readOnly: false,
  validity: { valid: true }, dataset: {}, labels: [], validationMessage: '',
  matches: selector => selector === ':disabled' ? false : true,
  getAttribute: name => name === 'aria-label' ? 'Description' : null,
  closest: () => null,
  ...overrides,
});

test('missing and spaces-only required text is rejected across input and textarea fields', () => {
  const errors = collectFormErrors({ elements: [field(), field({ value: '  \n\t ' })] });
  assert.equal(errors.length, 2);
  assert.ok(errors.every(error => error.message === 'This field is required.'));
});

test('disabled, readonly and optional blank fields do not block workflow actions', () => {
  assert.deepEqual(collectFormErrors({ elements: [
    field({ willValidate: false }), field({ readOnly: true }),
    field({ matches: () => true }), field({ required: false }),
  ] }), []);
});

test('invalid formats and zero quantities are rejected; zero cost is permitted', () => {
  const errors = collectFormErrors({ elements: [
    field({ value: 'bad-email', validity: { valid: false }, validationMessage: 'Enter a valid email.' }),
    field({ value: '0', dataset: { positive: 'true' } }),
    field({ value: '0' }), field({ value: '1.5', dataset: { positive: 'true' } }),
  ] });
  assert.equal(errors.length, 2);
  assert.equal(errors[1].message, 'Enter a number greater than zero.');
});

test('rejection validates only the reason, without requiring unfinished document details', () => {
  const reason = field({ value: 'Incorrect request' });
  const header = field({ matches: selector => selector === '[data-rejection-reason]' ? false : false });
  assert.deepEqual(collectFormErrors({ elements: [header, reason] }, '[data-rejection-reason]'), []);
});
