import { mergeAccountItems } from './accountItems.js';

const id = value => String(value?._id || value || '');

export function userRecordItems(data) {
  const rows = mergeAccountItems(data);
  for (const report of data.transferRecords || []) {
    if (report.direction !== 'INCOMING' || !['RECORDED', 'APPROVED'].includes(report.status)) continue;
    for (const item of report.items || []) {
      const existing = rows.find(row => item.accountability && id(row.accountability) === id(item.accountability));
      if (existing) {
        // Match the current custody period, never an earlier transfer of the same asset.
        const asset = (data.assets || []).find(asset => id(asset._id) === id(item.accountability));
        if (id(asset?.transferHistory?.at(-1)?.ptr) !== id(report._id)) continue;
        existing.transferNumber = report.ptrNumber;
        existing.documentNumber = report.ptrNumber;
        existing.issuedAt = report.date || report.createdAt;
        if (!existing.pendingReturn && !Number(existing.quantityReturned)) existing.status = 'Transferred in';
        continue;
      }
    }
  }
  return rows.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0));
}

// Pending requests and pending returns remain visible; completed custody does not.
export function currentIssuedItems(rows) {
  return rows.filter(row => !row.issued || (!row.transferred && Number(row.quantityRemaining) > 0));
}
