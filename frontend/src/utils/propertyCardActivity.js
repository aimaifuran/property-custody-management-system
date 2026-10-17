// Preserve the complete stock ledger for balances, but show accountability
// activity only after the first actual issuance. One document is one record,
// even when it contains many individually serialized inventory units.
export function propertyCardActivity(transactions = []) {
  const firstIssue = transactions.findIndex(row => row.type === 'Issue' && row.issued > 0);
  if (firstIssue < 0) return [];
  const groups = new Map();
  transactions.forEach((row, index) => {
    if (index < firstIssue || !['Issue', 'Return', 'Transfer'].includes(row.type)) return;
    const key = row.source?.id ? JSON.stringify([row.source.type, row.source.id, row.type, row.office || '', row.person || '']) : row.id;
    const group = groups.get(key) || { ...row, id: key, received: 0, issued: 0, amount: 0, serialNumbers: [], inventoryIds: [], accountabilityDocuments: [], notes: [], lastIndex: index };
    group.received += Number(row.received || 0);
    group.issued += Number(row.issued || 0);
    group.amount += Number(row.amount || 0);
    group.balance = row.balance;
    group.lastIndex = index;
    if (row.serialNumber && !group.serialNumbers.includes(row.serialNumber)) group.serialNumbers.push(row.serialNumber);
    if (row.inventory && !group.inventoryIds.includes(row.inventory)) group.inventoryIds.push(row.inventory);
    if (row.remarks && !group.notes.includes(row.remarks)) group.notes.push(row.remarks);
    for (const doc of row.accountabilityDocuments || []) if (!group.accountabilityDocuments.some(existing => existing.type === doc.type && existing.id === doc.id)) group.accountabilityDocuments.push(doc);
    groups.set(key, group);
  });
  return [...groups.values()].sort((a, b) => a.lastIndex - b.lastIndex).map(({ notes, lastIndex, ...row }) => ({ ...row, remarks: notes.join('; '), serialNumber: row.serialNumbers.join('; ') }));
}
