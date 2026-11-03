const monthOf = value => {
  if (!value || Number.isNaN(new Date(value).getTime())) return '';
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).slice(0, 7);
};
const id = value => String(value?._id || value || '');
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

const stockNumberOf = item => String(item.stockPropertyNumber || item.stockNumber || '').replace(/~[a-f0-9]{24}$/i, '');
const iarRows = rows => rows.filter(row => row.source === 'IAR').map(row => ({ ...row, stockNumber: stockNumberOf(row) }));

function collectMonthlyItems(sources) {
  const groups = new Map();
  const issued = (sources.ris || []).filter(record => !record.deleted && ['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(record.status));
  for (const record of sources.iar || []) {
    if (record.deleted || record.status === 'REJECTED') continue;
    const month = monthOf(record.createdAt || record.iarDate);
    if (!month) continue;
    const rows = groups.get(month) || [];
    (record.items || []).forEach((item, index) => {
      const description = item.description || item.item || '';
      if (!description.trim()) return;
      const inventories = new Set([item.inventory, ...(item.inventories || [])].map(id).filter(Boolean));
      const references = issued.filter(ris => (ris.items || []).some(line => {
        if (!(Number(line.quantityIssued) > 0)) return false;
        // Match the physical receipt first. Visible stock numbers can repeat.
        if (line.inventory && inventories.size) return inventories.has(id(line.inventory));
        if (line.property && item.property) return id(line.property) === id(item.property);
        if (line.inventory || line.property) return false;
        return id(ris.iar) === id(record._id) && Boolean(line.stockNumber)
          && line.stockNumber === (item.stockNumber || item.stockPropertyNumber);
      }));
      const risNumber = [...new Set(references.map(ris => ris.risNumber).filter(Boolean))].join(', ');
      rows.push({
        risNumber, responsibilityCenter: record.responsibilityCenterCode || '',
        stockNumber: stockNumberOf(item), item: description, unit: item.unit || '',
        quantity: number(item.quantity) ?? 0, unitCost: null, totalCost: null,
        source: 'IAR', sourceId: id(record._id), sourceRow: index, sourceNumber: record.iarNumber || '',
      });
    });
    if (rows.length) groups.set(month, rows);
  }
  return groups;
}

function recapitulate(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.stockNumber || '', row.item.trim().toLowerCase(), row.unit.toLowerCase()]);
    const entry = groups.get(key) || { stockNumber: row.stockNumber || '', item: row.item, unit: row.unit, quantity: 0, unitCost: null, totalCost: null, accountCode: '' };
    entry.quantity += row.quantity;
    groups.set(key, entry);
  }
  return [...groups.values()].sort((a, b) => a.item.localeCompare(b.item));
}
module.exports = { monthOf, collectMonthlyItems, recapitulate, iarRows };
