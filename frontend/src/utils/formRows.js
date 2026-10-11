// Compare editable fields with a fresh row so calculated defaults do not count as input.
export const hasRowData = (row, emptyRow) => Object.keys(emptyRow).some(key => {
  const value = row[key];
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return false;
  return String(value).trim() !== String(emptyRow[key] ?? '').trim();
});
