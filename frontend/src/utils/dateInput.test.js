import test from 'node:test';
import assert from 'node:assert/strict';
import { displayDate, parseDisplayDate } from './dateInput.js';

test('dates always display month first and preserve the saved calendar date', () => {
  assert.equal(displayDate('2026-11-03'), '11/03/2026');
  assert.equal(displayDate('2026-11-03T00:00:00.000Z'), '11/03/2026');
  assert.equal(parseDisplayDate('11/03/2026'), '2026-11-03');
  assert.equal(displayDate(''), '');
});

test('date entry rejects invalid dates and accepts leap days', () => {
  for (const value of ['31/01/2026', '02/29/2026', '04/31/2026', '11/03/26', '00/10/2026', '01/01/0000']) {
    assert.equal(parseDisplayDate(value), null, value);
  }
  assert.equal(parseDisplayDate('02/29/2028'), '2028-02-29');
});
