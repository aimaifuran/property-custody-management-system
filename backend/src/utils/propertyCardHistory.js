const { lineAmount } = require('./formAmounts');

// Balances belong to a receipt/item history, not the total stock of other receipts.
function propertyCardHistory(document) {
  const card = document.toObject ? document.toObject() : { ...document };
  const balances = new Map();
  const costs = new Map();
  const rows = card.items?.length ? card.items : (card.entries || []);
  const sourceItems = card.iar?.items || [];
  const groups = new Map();
  rows.forEach((row, index) => {
    const inventoryId = String(row.inventory?._id || row.inventory || '');
    const source = sourceItems.find(item => item.inventory && String(item.inventory?._id || item.inventory) === inventoryId) || (index < sourceItems.length ? sourceItems[index] : null);
    const label = row.propertyPlantAndEquipment || source?.propertyPlantAndEquipment;
    if (label && inventoryId) groups.set(inventoryId, label);
  });
  card.items = rows.map(row => {
    const inventory = row.inventory;
    const key = String(inventory?._id || inventory || row.propertyNumber || card.propertyNumber || row.description || 'legacy');
    const receipt = Number(row.receiptQuantity || 0);
    const issued = Number(row.itdQuantity || 0);
    const balance = (balances.get(key) || 0) + receipt - issued;
    balances.set(key, balance);
    const cost = row.unitCost ?? inventory?.unitCost ?? costs.get(key) ?? (receipt > 0 && row.amount != null ? Number(row.amount) / receipt : undefined);
    if (cost != null) costs.set(key, cost);
    return { ...row, transactionAmount: row.amount, propertyPlantAndEquipment: row.propertyPlantAndEquipment || groups.get(String(inventory?._id || inventory || '')) || (!String(card.propertyPlantAndEquipment || '').includes(';') ? card.propertyPlantAndEquipment : '') || 'Unclassified', balanceQuantity: balance, amount: cost != null ? lineAmount(issued > 0 ? issued : receipt, cost) : row.amount ?? null };
  });
  return card;
}
module.exports = { propertyCardHistory };
