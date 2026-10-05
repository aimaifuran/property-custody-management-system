const monthOf = value => {
  if (!value || Number.isNaN(new Date(value).getTime())) return '';
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).slice(0, 7);
};
const id = value => String(value?._id || value || '');
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

function collectMonthlyItems(sources) {
  const groups = new Map();
  const iars = new Set((sources.iar || []).filter(record => !record.deleted).map(record => id(record._id)));
  const returns = new Set((sources.prs || []).filter(record => !record.deleted).map(record => id(record._id)));
  const stocks = new Set();
  const inventoryItemIds = new Set((sources.inventory || []).map(record => id(record.item)));
  const append = (type, record, items, normalize) => {
    if (record.deleted || record.status === 'REJECTED') return;
    const month = monthOf(record.createdAt || record.date || record.iarDate);
    if (!month) return;
    const rows = groups.get(month) || [];
    items.forEach((item, index) => {
      const row = normalize(item);
      if (!row.item?.trim()) return;
      rows.push({ ...row, quantity: number(row.quantity) ?? 0, unitCost: number(row.unitCost), source: type, sourceId: id(record._id), sourceRow: index, sourceNumber: record.iarNumber || record.risNumber || record.parNumber || record.icsNumber || record.ptrNumber || record.prsNumber || record.mrNumber || '' });
      if (row.stockNumber) stocks.add(row.stockNumber);
    });
    if (rows.length) groups.set(month, rows);
  };
  const normalize = (record, item) => {
    const quantity = number(item.quantity ?? item.quantityIssued ?? item.quantityRequested ?? item.receiptQuantity) ?? (item.description ? 1 : 0);
    const total = number(item.totalCost ?? item.totalValue ?? item.amount);
    return { risNumber: record.risNumber || '', responsibilityCenter: record.responsibilityCenterCode || record.office || '', stockNumber: item.stockNumber || item.stockPropertyNumber || item.inventoryItemNo || item.propertyNumber || '', item: item.description || item.item || '', unit: item.unit || '', quantity, unitCost: number(item.unitCost ?? item.unitValue) ?? (quantity > 0 && total != null ? total / quantity : null) };
  };
  for (const record of sources.iar || []) {
    const linkedRis = (sources.ris || []).find(ris => !ris.deleted && ris.status !== 'REJECTED' && id(ris.iar) === id(record._id));
    append('IAR', record, record.items || [], item => ({ ...normalize(record, item), risNumber: linkedRis?.risNumber || '', responsibilityCenter: linkedRis?.responsibilityCenterCode || linkedRis?.office || record.responsibilityCenterCode || '' }));
  }
  for (const type of ['ris', 'ics', 'par', 'cards']) {
    for (const record of sources[type] || []) {
      if (record.iar && iars.has(id(record.iar))) continue;
      append(type.toUpperCase(), record, record.items?.length ? record.items : record.entries?.length ? record.entries.map(entry => ({ ...entry, description: record.description })) : [record], item => normalize(record, item));
    }
  }
  for (const record of sources.inventory || []) {
    if (record.inspectionAcceptanceReport && iars.has(id(record.inspectionAcceptanceReport))) continue;
    append('INVENTORY', record, [record], item => ({ ...normalize(record, item), item: record.item?.description || '', stockNumber: record.item?.stockNumber || record.propertyNumber || '', unit: record.item?.unit || '' }));
  }
  for (const type of ['ptr', 'prs', 'returned']) {
    for (const record of sources[type] || []) {
      if (type === 'returned' && record.prs && returns.has(id(record.prs))) continue;
      append(type.toUpperCase(), record, record.items || [record], item => normalize(record, item));
    }
  }
  for (const record of sources.items || []) {
    if (inventoryItemIds.has(id(record._id)) || stocks.has(record.stockNumber)) continue;
    append('ITEM', record, [record], item => ({ ...normalize(record, item), quantity: record.quantityOnHand || 0, unitCost: record.cost }));
  }
  for (const record of sources.properties || []) {
    if (stocks.has(record.propertyCode)) continue;
    append('PROPERTY', record, [record], item => ({ ...normalize(record, item), stockNumber: record.propertyCode || '', item: record.description || record.propertyName || '', quantity: record.quantity || 1, unit: record.unit || 'UNIT', unitCost: record.acquisitionCost == null ? null : record.acquisitionCost / (record.quantity || 1), responsibilityCenter: record.currentCustodian?.office || '' }));
  }
  return groups;
}

function recapitulate(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.stockNumber || '', row.item.trim().toLowerCase(), row.unit.toLowerCase(), row.unitCost]);
    const entry = groups.get(key) || { stockNumber: row.stockNumber || '', item: row.item, unit: row.unit, quantity: 0, unitCost: row.unitCost, totalCost: row.unitCost == null ? null : 0, accountCode: '' };
    entry.quantity += row.quantity;
    if (entry.totalCost != null) entry.totalCost += row.quantity * row.unitCost;
    groups.set(key, entry);
  }
  return [...groups.values()].map(row => ({ ...row, totalCost: row.totalCost == null ? null : Math.round((row.totalCost + Number.EPSILON) * 100) / 100 })).sort((a, b) => a.item.localeCompare(b.item));
}
module.exports = { monthOf, collectMonthlyItems, recapitulate };
