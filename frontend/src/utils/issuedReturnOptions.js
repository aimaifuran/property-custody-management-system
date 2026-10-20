const nameOf = item => item.itemName || item.description || item.stockNumber || '';
const normalize = value => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function groupUnserializedReturns(records) {
  return records.map(record => {
    const groups = new Map();
    for (const item of record.items) {
      const key = item.serialNumber?.trim() ? `serial:${item._id}` : JSON.stringify([normalize(nameOf(item)), normalize(item.unit || '')]);
      const group = groups.get(key) || { ...item, quantityRemaining: 0, returnLines: [], totalValue: 0 };
      const quantity = Number(item.quantityRemaining || 0);
      group.quantityRemaining += quantity;
      group.totalValue += quantity * Number(item.unitCost || 0);
      group.returnLines.push({ accountability: item.accountability || '', ris: record._id, risItem: item._id, description: item.description || '', unit: item.unit || '', propertyNumber: item.propertyNumber || '', mrNumber: record.risNumber || '', quantity, unitValue: Number(item.unitCost || 0), totalValue: quantity * Number(item.unitCost || 0) });
      group.unitCost = group.quantityRemaining ? group.totalValue / group.quantityRemaining : 0;
      groups.set(key, group);
    }
    return { ...record, items: [...groups.values()] };
  });
}

export const expandReturnRows = rows => rows.flatMap(row => row.returnLines?.length ? row.returnLines.map(line => ({ ...line })) : [row]);

export function availableReturnOptions(options, rows, currentIndex) {
  const selected = new Set(rows.filter((row, index) => index !== currentIndex && row.ris && row.risItem).map(row => `${row.ris}:${row.risItem}`));
  return options.filter(option => !selected.has(option.value));
}

export function issuedReturnOptions(records) {
  const items = records.flatMap(record => record.items.map(item => ({ record, item })));
  const counts = new Map();
  for (const { item } of items) {
    const key = normalize(nameOf(item));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return items.map(({ record, item }) => {
    const name = nameOf(item);
    const duplicate = counts.get(normalize(name)) > 1;
    const serial = item.serialNumber?.trim();
    return { value: `${record._id}:${item._id}`, label: duplicate && serial ? `${name} — Serial No. ${serial}` : name };
  });
}
