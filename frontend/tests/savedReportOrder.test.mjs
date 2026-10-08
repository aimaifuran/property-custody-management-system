import assert from 'node:assert/strict';
import test from 'node:test';
import { savedReportPage, sortSavedReports } from '../src/utils/savedReportOrder.js';

const record = (id, createdAt, lastEditedAt) => ({ _id: id, createdAt, lastEditedAt });

test('new forms stay first and the most recently edited form goes last', () => {
  const records = [
    record('old-edit', '2026-01-01', '2026-10-01'),
    record('latest-edit', '2026-10-07', '2026-10-08'),
    record('older-new', '2026-10-06'),
    record('latest-new', '2026-10-08'),
  ];
  assert.deepEqual(sortSavedReports(records).map(row => row._id), ['latest-new', 'older-new', 'old-edit', 'latest-edit']);
  assert.equal(records[0]._id, 'old-edit', 'sorting does not mutate loaded records');
  const editedAgain = records.map(row => row._id === 'old-edit' ? { ...row, lastEditedAt: '2026-10-09' } : row);
  assert.equal(sortSavedReports(editedAgain).at(-1)._id, 'old-edit');
});

test('workflow updates do not move a form to the edited section', () => {
  const records = [record('older', '2026-10-01'), record('newer', '2026-10-02')];
  records[0].updatedAt = '2026-10-08';
  assert.deepEqual(sortSavedReports(records).map(row => row._id), ['newer', 'older']);
});

test('missing dates and tied dates have deterministic ordering', () => {
  assert.deepEqual(sortSavedReports([record('a', 'bad-date'), record('b', null), record('c', '2026-10-01')]).map(row => row._id), ['c', 'b', 'a']);
});

test('pagination follows the edited record to the end of a multi-page list', () => {
  const records = Array.from({ length: 12 }, (_, index) => record(String(index), '2026-10-01'));
  records[0].lastEditedAt = '2026-10-08';
  const sorted = sortSavedReports(records);
  assert.equal(savedReportPage(sorted, '0', 5), 3);
  assert.equal(savedReportPage(sorted, '0', 10), 2);
  assert.equal(savedReportPage(sorted, 'absent', 5), null);
  assert.equal(savedReportPage(sorted, null, 5), null);
});
