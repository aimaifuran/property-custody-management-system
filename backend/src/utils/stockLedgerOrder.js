const time = value => { const result = new Date(value || 0).getTime(); return Number.isFinite(result) ? result : 0; };
const name = item => item.name?.trim() || (item.category?.toLowerCase() !== 'general' ? item.category?.trim() : '') || item.description || '';
function sortStockItems(items, sort = 'received') {
  return [...items].sort((a, b) => {
    if (sort === 'name') return name(a).localeCompare(name(b), undefined, { sensitivity: 'base', numeric: true }) || String(a.stockNumber).localeCompare(String(b.stockNumber), undefined, { numeric: true });
    return time(b.lastReceivedAt) - time(a.lastReceivedAt) || time(b.lastReceivedPostedAt) - time(a.lastReceivedPostedAt) || time(b.createdAt) - time(a.createdAt) || String(a.stockNumber).localeCompare(String(b.stockNumber), undefined, { numeric: true });
  });
}
function isNewStockItem(item, now = Date.now()) {
  const received = time(item.firstReceivedAt);
  return received > 0 && now >= received && now - received < 24 * 60 * 60 * 1000;
}
module.exports = { sortStockItems, isNewStockItem };
