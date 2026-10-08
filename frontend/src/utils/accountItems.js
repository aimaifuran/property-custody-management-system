const idOf = value => String(value?._id || value || '');
const numberOf = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const risKey = row => {
  const ris = idOf(row.risId || row.ris);
  const item = idOf(row.itemId || row.risItem);
  return ris && item ? `${ris}:${item}` : '';
};
const confirmedQuantity = entries => entries.filter(entry => entry.status === 'RETURNED').reduce((total, entry) => total + numberOf(entry.quantity), 0);
const returnStatus = (remaining, returned, pending) => pending ? 'Awaiting admin confirmation' : remaining === 0 ? 'Successfully returned' : returned > 0 ? 'Partially returned' : 'Not returned';

function mergeReturns(existing, additions) {
  const addedNumbers = new Set(additions.map(entry => entry.prsNumber).filter(Boolean));
  return [...additions, ...existing.filter(entry => !entry.prsNumber || !addedNumbers.has(entry.prsNumber))];
}

export async function loadAccountItems(client, path) {
  const [ris, assets, returns] = await Promise.all([
    client.get(path), client.get('/custody/assets'), client.get('/custody/returns'),
  ]);
  return { risRows: ris.data.data || [], assets: assets.data.data || [], returnSlips: returns.data.data || [] };
}

// RIS records remain owned by the requester after a transfer. Current custody
// and the user's own return receipts supply the receiver's rows instead.
export function mergeAccountItems({ risRows = [], assets = [], returnSlips = [], previousRows = [] }) {
  const rows = risRows.map((row, index) => ({ ...row, rowKey: risKey(row) || `ris:${idOf(row._id) || index}`, returns: row.returns || [] }));
  const history = new Map();
  for (const slip of returnSlips) {
    for (const entry of slip.items || []) {
      const accountability = idOf(entry.accountability);
      if (!accountability) continue;
      const entries = history.get(accountability) || [];
      entries.push({
        ...entry, accountability, risId: idOf(entry.ris), itemId: idOf(entry.risItem),
        prsNumber: slip.prsNumber, status: slip.status || 'RETURNED',
        rejectionReason: slip.rejectionReason, date: slip.returnedTo?.date || slip.createdAt,
        submittedAt: slip.createdAt || slip.returnedBy?.date,
        receivedBy: slip.returnedTo?.name, note: slip.note,
      });
      history.set(accountability, entries);
    }
  }

  const activeIds = new Set();
  for (const asset of assets) {
    const accountability = idOf(asset._id);
    activeIds.add(accountability);
    const key = risKey(asset);
    const index = rows.findIndex(row => row.accountability === accountability || (key && risKey(row) === key));
    const base = index >= 0 ? rows[index] : {};
    const transfer = asset.transferHistory?.at(-1);
    const transferTime = transfer?.date ? new Date(transfer.date).getTime() : null;
    const ownReturns = (history.get(accountability) || []).filter(entry => !transferTime || new Date(entry.submittedAt || entry.date).getTime() >= transferTime);
    const returns = transfer ? ownReturns : mergeReturns(base.returns || [], ownReturns);
    const quantityReturned = confirmedQuantity(returns);
    const quantityRemaining = Math.max(0, asset.quantityRemaining == null ? numberOf(asset.quantity) - numberOf(asset.returnedQuantity) : numberOf(asset.quantityRemaining));
    const pendingReturn = Boolean(asset.pendingMovement) || returns.some(entry => entry.status === 'PENDING');
    const stock = asset.inventory?.item || {};
    const row = {
      ...base, rowKey: `asset:${accountability}`, accountability,
      risId: idOf(asset.ris) || base.risId, itemId: idOf(asset.risItem) || base.itemId,
      risNumber: base.risNumber || asset.ris?.risNumber || '',
      description: stock.description || stock.name || base.description || asset.propertyNumber || 'Property',
      stockNumber: stock.stockNumber || base.stockNumber || '', unit: stock.unit || base.unit,
      formType: asset.formType, documentNumber: asset.documentNumber, formId: asset.issuanceForm,
      unitCost: asset.inventory?.unitCost ?? base.unitCost,
      // Prior custodians' returns stay in the global accountability counter.
      // Only this user's receipts belong in this custody period's issued total.
      quantityIssued: transfer ? quantityRemaining + quantityReturned : numberOf(base.quantityIssued ?? asset.quantity),
      quantityReturned, quantityRemaining, pendingReturn, returns,
      quantityRequested: base.quantityRequested ?? null, issued: true, transferred: false,
      issuedAt: transfer?.date || asset.issueDate || base.issuedAt,
      acceptedAt: asset.acceptedAt, historyOnly: false, custodyStartedAt: transfer?.date || null,
      status: returnStatus(quantityRemaining, quantityReturned, pendingReturn),
    };
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }

  // Fully returned assets no longer appear in /custody/assets. Keep the user's
  // receipts visible without inventing a remaining quantity or issuance total.
  for (const [accountability, entries] of history) {
    if (activeIds.has(accountability)) continue;
    const first = entries[0];
    const key = risKey(first);
    const index = rows.findIndex(row => row.accountability === accountability || (key && risKey(row) === key));
    const base = index >= 0 ? rows[index] : {};
    if (base.transferred) continue;
    const previous = previousRows.find(row => row.accountability === accountability) || {};
    const custodyStartedAt = previous.custodyStartedAt;
    const ownEntries = custodyStartedAt ? entries.filter(entry => new Date(entry.submittedAt || entry.date).getTime() >= new Date(custodyStartedAt).getTime()) : entries;
    const returns = custodyStartedAt ? ownEntries : mergeReturns(base.returns || [], ownEntries);
    const quantityReturned = confirmedQuantity(returns);
    const quantityIssued = previous.quantityIssued ?? base.quantityIssued ?? null;
    const fullyReturned = quantityIssued != null && quantityReturned >= quantityIssued && quantityIssued > 0;
    const pendingReturn = returns.some(entry => entry.status === 'PENDING');
    const row = {
      ...previous, ...base, rowKey: `asset:${accountability}`, accountability,
      risId: first.risId, itemId: first.itemId,
      risNumber: base.risNumber || previous.risNumber || '',
      description: base.description || previous.description || first.description || first.propertyNumber || 'Property',
      stockNumber: base.stockNumber || previous.stockNumber || '',
      formType: previous.formType || base.formType || (numberOf(first.unitValue) < 50000 ? 'ICS' : 'PAR'),
      documentNumber: previous.documentNumber || (first.mrNumber && first.mrNumber !== base.risNumber ? first.mrNumber : base.documentNumber),
      quantityRequested: base.quantityRequested ?? null,
      quantityIssued, quantityReturned, quantityRemaining: 0, pendingReturn, returns,
      issued: true, transferred: false, historyOnly: true, custodyStartedAt,
      status: pendingReturn ? 'Awaiting admin confirmation' : fullyReturned ? 'Successfully returned' : quantityReturned > 0 ? 'Receipt confirmed' : 'No current accountability',
    };
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }
  return rows;
}

export function returnSubmission(item, quantity) {
  return item.accountability
    ? { path: '/custody/returns', body: { accountability: item.accountability, quantity } }
    : { path: '/ris/my-returns', body: { risId: item.risId, itemId: item.itemId, quantity } };
}
