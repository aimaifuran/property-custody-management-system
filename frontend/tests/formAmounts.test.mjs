import test from 'node:test';
import assert from 'node:assert/strict';
import { lineAmount, sumAmounts } from '../src/utils/formAmounts.js';
test('form calculations round row amounts before summing', () => {
  assert.equal(lineAmount(3, 0.1), 0.3);
  assert.equal(lineAmount(1, 1.005), 1.01);
  assert.equal(sumAmounts([lineAmount(3, 0.1), lineAmount(2, 0.1)]), 0.5);
});
