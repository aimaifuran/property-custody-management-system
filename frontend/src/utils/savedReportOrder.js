const timestamp = value => {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

// New forms stay first; each successfully edited form moves behind earlier edits.
// Workflow timestamps are deliberately separate from manual edits.
export function sortSavedReports(records) {
  return [...records].sort((a, b) => {
    const aEdited = timestamp(a.lastEditedAt);
    const bEdited = timestamp(b.lastEditedAt);
    if (aEdited !== bEdited) return aEdited - bEdited;
    const created = timestamp(b.createdAt) - timestamp(a.createdAt);
    return created || String(b._id || '').localeCompare(String(a._id || ''));
  });
}

export function savedReportPage(records, recordId, perPage) {
  if (!recordId) return null;
  const index = records.findIndex(record => record._id === recordId);
  return index < 0 ? null : Math.floor(index / perPage) + 1;
}
