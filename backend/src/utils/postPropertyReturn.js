const Accountability = require('../models/PropertyAccountability');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const RIS = require('../models/RequisitionIssueSlip');
const Ledger = require('../models/LedgerTransaction');
const Card = require('../models/PropertyCard');
const ReturnedSupply = require('../models/ReturnedSupply');

// Call in the same transaction as PRS receipt. Pending requests never change stock.
module.exports = async function postPropertyReturn(report, session) {
  if (report.stockPosted) return;
  // Serialize linked receipts, including legacy rows without inventory/accountability.
  for (const ris of [...new Set(report.items.map(entry => entry.ris && String(entry.ris)).filter(Boolean))]) {
    await RIS.updateOne({ _id: ris }, { $inc: { returnRevision: 1 } }, { session });
  }
  for (const entry of report.items) {
    const quantity = Number(entry.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Return quantities must be positive whole numbers');
    const condition = entry.condition || 'Serviceable';
    let accountability = entry.accountability
      ? await Accountability.findOne({ _id: entry.accountability, deleted: false }).session(session)
      : entry.ris && entry.risItem ? await Accountability.findOne({ ris: entry.ris, risItem: entry.risItem, deleted: false }).session(session) : null;
    let inventory;
    if (entry.accountability && !accountability) throw new Error('Accountability not found');
    if (accountability) {
      if (!accountability.active || quantity > Number(accountability.quantity || 0) - Number(accountability.returnedQuantity || 0)) throw new Error('Return exceeds the remaining accountability');
      const owner = report.returnedBy?.user || report.submittedBy;
      if (owner && String(owner) !== String(accountability.user)) throw new Error('This property is assigned to another custodian');
      if (accountability.pendingMovement && accountability.pendingMovement !== `PRS:${report._id}`) throw new Error('This property already has a pending movement');
      accountability.returnedQuantity = Number(accountability.returnedQuantity || 0) + quantity;
      accountability.active = accountability.returnedQuantity < accountability.quantity;
      accountability.condition = condition;
      accountability.pendingMovement = undefined;
      await accountability.save({ session });
      inventory = await Inventory.findOne({ _id: accountability.inventory, deleted: false }).session(session);
      entry.accountability = accountability._id;
    } else if (entry.ris && entry.risItem) {
      const ris = await RIS.findById(entry.ris).session(session);
      const line = ris?.items.id(entry.risItem);
      const stock = line ? await Item.findOne({ stockNumber: line.stockNumber, deleted: false }).session(session) : null;
      if (stock) inventory = await Inventory.findOne({ item: stock._id, deleted: false }).sort({ createdAt: -1 }).session(session);
    }
    if (inventory) {
      const serviceable = condition === 'Serviceable';
      const stock = await Item.findOneAndUpdate({ _id: inventory.item, deleted: false }, { $inc: { quantityOnHand: serviceable ? quantity : 0 } }, { returnDocument: 'after', session });
      if (!stock) throw new Error('The returned inventory item was not found');
      if (serviceable) stock.status = 'IN_STORAGE_AVAILABLE';
      else if (!stock.quantityOnHand) stock.status = 'RETURNED_UNSERVICEABLE';
      await stock.save({ session });
      const inUse = await Accountability.exists({ inventory: inventory._id, active: true, deleted: false }).session(session);
      inventory.status = inUse ? 'ACTIVE_IN_USE' : serviceable ? 'IN_STORAGE_AVAILABLE' : 'RETURNED_UNSERVICEABLE';
      if (!inUse) inventory.accountability = undefined;
      await inventory.save({ session });
      if (serviceable) await Ledger.create([{ inventory: inventory._id, type: 'incoming', quantity, reference: report.prsNumber || String(report._id), description: 'PRS returned - serviceable', runningBalance: stock.quantityOnHand }], { session });
      await Card.updateMany({ deleted: false, 'items.inventory': inventory._id }, { $push: { items: { inventory: inventory._id, propertyNumber: inventory.propertyNumber || stock.stockNumber, description: entry.description, date: report.returnedTo?.date || new Date(), receiptQuantity: serviceable ? quantity : 0, itdQuantity: 0, balanceQuantity: stock.quantityOnHand, amount: quantity * Number(entry.unitValue || 0), remarks: `PRS ${report.prsNumber || report._id}: Returned - ${condition}` } } }, { session });
    }
  }
  if (report.items.length) await ReturnedSupply.create(report.items.map(entry => ({ prs: report._id, ris: entry.ris, risItem: entry.risItem, lguName: report.lguName, purpose: report.purpose, quantity: entry.quantity, unit: entry.unit, description: entry.description, propertyNumber: entry.propertyNumber, mrNumber: entry.mrNumber, unitValue: entry.unitValue, totalValue: entry.totalValue, condition: entry.condition, note: report.note, returnedBy: report.returnedBy, returnedTo: report.returnedTo })), { session, ordered: true });
  report.stockPosted = true;
  await report.save({ session });
};
