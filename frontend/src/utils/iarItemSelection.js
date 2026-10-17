// Item choices contain names only; specifications and unit identities are separate.
export const stockItemName = item => item.name?.trim() || (item.category?.trim().toLowerCase() !== 'general' ? item.category?.trim() : '') || '';
export const stockItemOption = stockItemName;
export const stockItemNames = items => [...new Map(items.map(item => stockItemName(item)).filter(Boolean).map(name => [name.toLowerCase(), name])).values()];
export function selectIarStockItem(row, item) {
  return { ...row, stockNumber: item.stockNumber, stockPropertyNumber: item.stockNumber,
    propertyPlantAndEquipment: stockItemName(item), unit: row.unit || item.unit, itemType: item.itemType,
    inventory: undefined, property: undefined,
  };
}
