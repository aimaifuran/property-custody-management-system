import { todayManila } from './formDates.js';
import { propertyCardActivity } from './propertyCardActivity.js';

export function itemLedgerSelection(details, { from = '', to = '', type = '', office = '', activityOnly = false } = {}) {
  const transactions = details?.transactions || [];
  const day = row => todayManila(new Date(row.date));
  const visible = activityOnly ? propertyCardActivity(transactions) : transactions;
  const rows = visible.filter(row => (!from || day(row) >= from) && (!to || day(row) <= to) && (!type || row.type === type) && (!office || `${row.office || ''} ${row.person || ''}`.toLowerCase().includes(office.toLowerCase())));
  const ending = transactions.filter(row => !to || day(row) <= to).at(-1)?.balance ?? details?.summary.openingBalance ?? 0;
  const firstIssue = transactions.find(row => row.type === 'Issue' && row.issued > 0);
  const initialStock = firstIssue ? Number(firstIssue.balance) + Number(firstIssue.issued || 0) - Number(firstIssue.received || 0) : details?.summary.currentBalance ?? ending;
  const beginning = activityOnly && !from ? initialStock : transactions.filter(row => from && day(row) < from).at(-1)?.balance ?? details?.summary.openingBalance ?? 0;
  return { rows, beginning, ending, initialStock };
}

export function buildItemPropertyCardExport(details, filters = {}) {
  const { rows, initialStock } = itemLedgerSelection(details, filters);
  const issueRows = rows.filter(row => row.type === 'Issue' && Number(row.issued) > 0);
  if (filters.activityOnly && !issueRows.length) return { ...details.exportHeader, month: [filters.from, filters.to].filter(Boolean).join(' to '), items: [] };
  return {
    ...details.exportHeader,
    month: [filters.from, filters.to].filter(Boolean).join(' to '),
    items: issueRows.map(row => ({
      date: row.date,
      referenceParNo: row.reference || '',
      receiptQuantity: initialStock,
      itdQuantity: Number(row.issued || 0),
      itdOfficeOfficer: row.person || row.office || '',
      balanceQuantity: 0,
      remarks: row.remarks || '',
      amount: Number(row.amount || 0),
    })),
  };
}
