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
  const { rows, beginning, ending } = itemLedgerSelection(details, filters);
  return { ...details.exportHeader, month: [filters.from, filters.to].filter(Boolean).join(' to '), items: filters.activityOnly && !rows.length ? [] : [
    { date: filters.from || details.transactions[0]?.date, receiptQuantity: null, itdQuantity: null, balanceQuantity: beginning, remarks: 'Beginning balance', amount: null },
    ...rows.map(row => ({ date: row.date, referenceParNo: row.reference, receiptQuantity: row.received || null, itdQuantity: row.issued || null, itdOfficeOfficer: row.office || row.person, balanceQuantity: row.balance, amount: row.amount, remarks: `${row.type}: ${row.remarks}` })),
    { balanceQuantity: ending, remarks: 'Ending balance', amount: null },
  ] };
}
