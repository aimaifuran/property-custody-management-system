const uniqueValues = values => [...new Set(values.filter(value => value != null && String(value).trim()).map(value => String(value).trim()))].join('; ');

export function propertyCardGroups(card) {
  const groups = new Map();
  for (const row of card?.items || []) {
    const label = row.propertyPlantAndEquipment?.trim() || 'Unclassified';
    const key = label.toLowerCase().replace(/\s+/g, ' ');
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(row);
  }
  return [...groups.values()].map(group => {
    const receipts = group.items.filter(row => Number(row.receiptQuantity) > 0);
    const details = receipts.length ? receipts : group.items;
    return { ...group, card: { ...card, propertyPlantAndEquipment: group.label,
      description: uniqueValues(details.map(row => row.description)),
      propertyNumber: uniqueValues(details.map(row => row.propertyNumber)),
      serialNumber: uniqueValues(details.map(row => row.serialNumber)), items: group.items,
    } };
  });
}
