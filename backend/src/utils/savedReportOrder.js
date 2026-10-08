const SAVED_REPORT_SORT = { lastEditedAt: 1, createdAt: -1, _id: -1 };

// Workflow updates also change updatedAt; only saving an edit moves a form
// beneath untouched forms, in the order those edits were saved.
const recordSort = Model => Model.schema?.path('lastEditedAt')
  ? SAVED_REPORT_SORT
  : { updatedAt: -1, createdAt: -1 };

const timestamp = value => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const sortSavedReports = records => [...records].sort((left, right) =>
  timestamp(left.lastEditedAt) - timestamp(right.lastEditedAt)
  || timestamp(right.createdAt) - timestamp(left.createdAt)
  || String(right._id || '').localeCompare(String(left._id || ''))
);

module.exports = { SAVED_REPORT_SORT, recordSort, sortSavedReports };
