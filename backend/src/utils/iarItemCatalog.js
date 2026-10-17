// Include received item names even when no units have been issued or remain in stock.
module.exports = function iarItemCatalog(reports, stocks) {
  const stockMap = new Map(stocks.map(stock => [stock.stockNumber, stock]));
  const groups = new Map();
  for (const report of reports) for (const row of report.items || []) {
    const stock = stockMap.get(row.stockNumber || row.stockPropertyNumber);
    const name = row.propertyPlantAndEquipment?.trim() || stock?.name?.trim() || row.description?.trim() || row.item?.trim();
    if (!name) continue;
    const unit = stock?.unit || row.unit || '';
    const classification = stock?.itemType || row.itemType;
    const id = JSON.stringify([name.toLowerCase(), unit, classification]);
    groups.set(id, { id, name, unit, classification, category: stock?.category === 'General' ? '' : stock?.category || '' });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
};
