const test = require('node:test');
const assert = require('node:assert/strict');

test('newly confirmed returns appear first even when their requests were created earlier', async () => {
  const { sortReturnedReports } = await import('../../frontend/src/utils/returnedReportOrder.js');
  const records = [
    { _id: 'older', status: 'RETURNED', createdAt: '2026-10-20', returnedAt: '2026-10-21', updatedAt: '2026-10-30' },
    { _id: 'newly-confirmed', status: 'RETURNED', createdAt: '2026-10-01', returnedAt: '2026-10-25' },
    { _id: 'legacy', status: 'RETURNED', createdAt: '2026-10-02', updatedAt: '2026-10-22' },
  ];
  assert.deepEqual(sortReturnedReports(records).map(row => row._id), ['newly-confirmed', 'legacy', 'older']);
  assert.equal(records[0]._id, 'older');
});
