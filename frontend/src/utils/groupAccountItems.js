// Keep source identities for returns while displaying one item per issuance day.
export function groupAccountItems(rows) {
  const groups = new Map();
  for (const row of rows) {
    const date = row.issuedAt ? new Date(row.issuedAt) : null;
    const day = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-CA') : row.rowKey;
    const key = JSON.stringify([row.stockNumber || '', (row.description || '').trim().toLowerCase(), row.unit || '', day, row.transferNumber || '']);
    let group = groups.get(key);
    if (!group) {
      group = { ...row, rowKey: key, members: [], quantityIssued: 0, quantityReturned: 0, quantityRemaining: 0, returnableQuantity: 0, pendingQuantity: 0, documents: [] };
      groups.set(key, group);
    }
    group.members.push(row);
    for (const field of ['quantityIssued', 'quantityReturned', 'quantityRemaining']) group[field] += Number(row[field]) || 0;
    if (!row.pendingReturn && !row.historyOnly) group.returnableQuantity += Number(row.quantityRemaining) || 0;
    if (row.pendingReturn) group.pendingQuantity += Number(row.quantityRemaining) || 0;
    const document = row.documentNumber || row.risNumber;
    if (document && !group.documents.includes(document)) group.documents.push(document);
  }
  return [...groups.values()].map(group => ({ ...group,
    documentNumber: group.documents.join(', '),
    pendingReturn: group.returnableQuantity === 0 && group.pendingQuantity > 0,
    historyOnly: group.members.every(row => row.historyOnly),
    status: group.pendingQuantity > 0 ? `${group.pendingQuantity} awaiting admin confirmation` : group.quantityReturned > 0 ? 'Partially returned' : group.transferNumber ? group.status : 'Not returned',
  }));
}

export function allocateAccountReturn(group, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > group.returnableQuantity) throw new Error('Enter a quantity within the returnable balance.');
  let remaining = quantity;
  const allocations = [];
  for (const member of group.members) {
    if (member.pendingReturn || member.historyOnly || remaining <= 0) continue;
    const amount = Math.min(remaining, member.quantityRemaining);
    if (amount > 0) allocations.push({ member, quantity: amount });
    remaining -= amount;
  }
  return allocations;
}
