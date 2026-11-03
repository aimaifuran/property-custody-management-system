const PropertyCard = require('../models/PropertyCard');

async function issuedPropertyStockIds() {
  const cards = await PropertyCard.find({ deleted: false, items: { $elemMatch: { itdQuantity: { $gt: 0 } } } }).select('stockItem').lean();
  return cards.map(card => card.stockItem).filter(Boolean);
}

module.exports = { issuedPropertyStockIds };
