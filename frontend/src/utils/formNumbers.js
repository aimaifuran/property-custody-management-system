// Database identities stay intact; forms show the administrator's numbers.
export function formNumber(value) {
  const text = String(value ?? '');
  if (/^P-[a-f0-9]{24}$/i.test(text)) return '';
  return text.replace(/~[a-f0-9]{24}$/i, '');
}

const numberFields = new Set(['stockNumber', 'stock_number', 'stockPropertyNumber', 'displayStockNumber', 'propertyNumber', 'propertyCode', 'inventoryItemNo']);
export function formNumberValue(key, value) {
  return numberFields.has(key) ? formNumber(value) : value;
}

export function formNumberData(value) {
  if (Array.isArray(value)) return value.map(formNumberData);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
    numberFields.has(key) ? formNumber(key === 'stockNumber' ? value.displayStockNumber || value.stockPropertyNumber || entry : entry) : formNumberData(entry),
  ]));
}
