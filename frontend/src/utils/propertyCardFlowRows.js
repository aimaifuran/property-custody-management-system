// System table only. Keep the complete receipt history for PDF and print exports.
export function propertyCardFlowRows(items = []) {
  return items.filter(row => ['RIS', 'PTR'].includes(row.sourceType) || (!row.sourceType && /^(RIS|PTR)\s+/i.test(row.remarks || '')))
    .map(row => ({ ...row, date: row.sourceDate || row.date,
      amount: row.transactionAmount ?? row.amount,
      remarks: row.sourceRemarks || row.remarks,
    }));
}
