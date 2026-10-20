const Item = require('../models/Item');

function checkRequestedStock(rows, stocks) {
  const byNumber = new Map(stocks.map(stock => [stock.stockNumber, stock]));
  const totals = new Map();
  for (const row of rows || []) {
    if (!row.stockNumber) continue;
    const stock = byNumber.get(row.stockNumber);
    const quantity = Number(row.quantityRequested || 0);
    const total = (totals.get(row.stockNumber) || 0) + quantity;
    totals.set(row.stockNumber, total);
    if (!stock || total > Number(stock.quantityOnHand || 0)) throw new Error(`${stock?.name || row.itemName || row.description || 'Item'}: requested quantity exceeds available stock (${Number(stock?.quantityOnHand || 0)}).`);
  }
}

module.exports = async function validateRequestedStock(rows, session = null) {
  const numbers = (rows || []).map(row => row.stockNumber).filter(Boolean);
  const stocks = await Item.find({ deleted: false, stockNumber: { $in: numbers } }).session(session).lean();
  checkRequestedStock(rows, stocks);
};
module.exports.checkRequestedStock = checkRequestedStock;
