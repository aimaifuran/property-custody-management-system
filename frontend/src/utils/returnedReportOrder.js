const timestamp = value => {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

export function sortReturnedReports(records) {
  const received = record => timestamp(record.returnedAt || (record.status === 'RETURNED' && record.updatedAt) || record.createdAt);
  return [...records].sort((a, b) => received(b) - received(a) || String(b._id || '').localeCompare(String(a._id || '')));
}
