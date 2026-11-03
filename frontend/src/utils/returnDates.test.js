import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedReturnDates } from './returnDates.js';

test('return dates include confirmed receipts only, ordered and deduplicated in Manila time', () => {
  assert.equal(confirmedReturnDates([
    { status: 'RETURNED', date: '2026-11-04T00:00:00Z' },
    { status: 'PENDING', date: '2026-11-01' },
    { status: 'REJECTED', date: '2026-11-02' },
    { status: 'RETURNED', date: '2026-11-02T16:30:00Z' },
    { status: 'RETURNED', date: '2026-11-03T01:00:00Z' },
    { status: 'RETURNED', date: 'invalid' },
  ]), '11/03/2026, 11/04/2026');
  assert.equal(confirmedReturnDates(), '');
});
