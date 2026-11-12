const rowKey = row => JSON.stringify([row.source, row.sourceId, row.sourceRow]);
const manualRows = rows => rows.map(row => ({ ...row }));
const applyAccounting = (rows, entries) => {
  if (entries === undefined) return manualRows(rows);
  if (!Array.isArray(entries) || entries.length > 500) throw new Error('Invalid accounting rows');
  const values = new Map(entries.map(entry => {
    const amounts = {};
    for (const field of ['unitCost', 'totalCost']) {
      const value = entry[field];
      if (value == null || value === '' || (typeof value === 'string' && !value.trim())) amounts[field] = null;
      else if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('Enter a nonnegative accounting amount');
      else amounts[field] = Number(value);
    }
    return [rowKey(entry), amounts];
  }));
  return manualRows(rows).map(row => {
    const amounts = values.get(rowKey(row));
    if (!amounts || (amounts.unitCost == null && amounts.totalCost == null)) return row;
    return { ...row, ...(amounts.unitCost == null ? {} : { unitCost: amounts.unitCost }), ...(amounts.totalCost == null ? {} : { totalCost: amounts.totalCost }), accountingManual: true };
  });
};
module.exports = { rowKey, manualRows, applyAccounting };
