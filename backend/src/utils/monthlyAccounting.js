const rowKey = row => JSON.stringify([row.source, row.sourceId, row.sourceRow]);
const manualRows = rows => rows.map(row => ({ ...row, unitCost: row.accountingManual ? row.unitCost ?? null : null, totalCost: row.accountingManual ? row.totalCost ?? null : null }));
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
  return manualRows(rows).map(row => values.has(rowKey(row)) ? { ...row, ...values.get(rowKey(row)), accountingManual: true } : row);
};
module.exports = { rowKey, manualRows, applyAccounting };
