const monthOf = value => {
  if (!value || Number.isNaN(new Date(value).getTime())) return '';
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).slice(0, 7);
};
const id = value => String(value?._id || value || '');
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const blankPlaceholder = value => ['-', '—'].includes(String(value || '').trim()) ? '' : value || '';

const stockNumberOf = item => String(item.stockPropertyNumber || item.stockNumber || '').replace(/~[a-f0-9]{24}$/i, '');
const iarRows = rows => rows.filter(row => row.source === 'IAR').map(row => ({ ...row, stockNumber: stockNumberOf(row) }));

function collectMonthlyItems(sources) {
  const groups = new Map();
  const issued = (sources.ris || []).filter(record => !record.deleted && record.status === 'ACCOUNTABILITY_LOCKED');
  for (const record of sources.iar || []) {
    if (record.deleted || record.status === 'REJECTED') continue;
    const month = monthOf(record.createdAt || record.iarDate);
    if (!month) continue;
    const rows = groups.get(month) || [];
    (record.items || []).forEach((item, index) => {
      const description = item.description || item.item || '';
      const itemName = item.propertyPlantAndEquipment || item.itemName || '';
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
      if (!references.length) return;
      const risNumber = [...new Set(references.map(ris => ris.risNumber).filter(Boolean))].join(', ');
      rows.push({
        risNumber, responsibilityCenter: blankPlaceholder(record.responsibilityCenterCode),
        stockNumber: stockNumberOf(item), item: description, itemName, unit: item.unit || '',
        quantity: number(item.quantity) ?? 0,
        unitCost: number(item.unitCost),
        totalCost: number(item.totalCost) ?? ((number(item.quantity) ?? 0) * (number(item.unitCost) ?? 0)),
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
    const item = String(row.itemName || row.item || '').trim();
    const unit = 'pc';
    const key = item.toLowerCase().replace(/\s+/g, ' ');
    const entry = groups.get(key) || {
      stockNumber: '', item, unit, quantity: 0, unitCost: null, totalCost: 0, accountCode: '',
      costQuantity: 0,
    };
    entry.quantity += row.quantity;
    if (!entry.stockNumber && row.stockNumber) entry.stockNumber = String(row.stockNumber);
    const rowTotal = number(row.totalCost);
    const rowUnitCost = number(row.unitCost);
    if (rowTotal != null) {
      entry.totalCost += rowTotal;
      if (rowUnitCost != null) entry.costQuantity += row.quantity;
    }
    groups.set(key, entry);
  }
  return [...groups.values()].map(entry => {
    entry.unitCost = entry.costQuantity ? entry.totalCost / entry.costQuantity : null;
    if (entry.totalCost === 0 && !entry.costQuantity) entry.totalCost = null;
    delete entry.costQuantity;
    return entry;
  }).sort((a, b) => a.item.localeCompare(b.item));
}
module.exports = { monthOf, collectMonthlyItems, recapitulate, iarRows };
