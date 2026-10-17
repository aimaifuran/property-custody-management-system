import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingUserReturns, returnRequestUserId } from '../src/utils/usePendingReturns.js';

test('return badges count pending requests by their user and clear only after resolution', () => {
  const requests = [
    { status: 'PENDING', submittedBy: 'catherine' },
    { status: 'PENDING', returnedBy: { user: { _id: 'catherine' } } },
    { status: 'PENDING', submittedBy: { _id: 'cherie' } },
    { status: 'RETURNED', submittedBy: 'catherine' },
    { status: 'REJECTED', submittedBy: 'cherie' },
    { status: 'PENDING', returnedBy: { name: 'Manual recipient' } },
  ];
  const pending = pendingUserReturns(requests);
  assert.equal(pending.length, 3);
  assert.equal(pending.filter(request => returnRequestUserId(request) === 'catherine').length, 2);
  requests[0].status = 'RETURNED';
  assert.equal(pendingUserReturns(requests).length, 2);
});
