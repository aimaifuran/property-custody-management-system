const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const Card = require('../models/PropertyCard');

module.exports = async function syncTransferCard(report, session) {
  await Card.updateMany({ 'items.sourceType': 'PTR', 'items.sourceDocument': report._id }, { $pull: { items: { sourceType: 'PTR', sourceDocument: report._id } } }, { session });
  for (const entry of report.items) {
    let inventory;
    if (entry.inventory && mongoose.isValidObjectId(entry.inventory)) inventory = await Inventory.findOne({ _id: entry.inventory, deleted: false }).session(session);
    else if (entry.property) inventory = await Inventory.findOne({ property: entry.property, deleted: false }).session(session);
    else if (entry.propertyNumber) {
      const matches = await Inventory.find({ propertyNumber: entry.propertyNumber, deleted: false }).limit(2).session(session);
      if (matches.length === 1) inventory = matches[0];
    }
    // Do not guess a receipt when a legacy transfer has no unique asset link.
    if (!inventory) continue;
    entry.inventory = inventory._id; entry.property = inventory.property; entry.serialNumber = inventory.serialNumber;
    await Card.updateMany({ deleted: false, 'items.inventory': inventory._id }, { $push: { items: {
      sourceType: 'PTR', sourceDocument: report._id, sourceDate: report.date,
      sourceRemarks: report.remarks || report.reasonForTransfer,
      inventory: inventory._id, property: inventory.property, serialNumber: inventory.serialNumber,
      propertyNumber: entry.propertyNumber || inventory.propertyNumber, description: entry.description,
      date: report.date, receiptQuantity: 0, itdQuantity: 0,
      itdOfficeOfficer: report.toAccountableOfficer, amount: entry.amount,
      remarks: `PTR ${report.ptrNumber}: ${report.fromAccountableOfficer} to ${report.toAccountableOfficer}`,
    } } }, { session });
  }
  await report.save({ session });
};
