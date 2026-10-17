const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const Accountability = require('../models/PropertyAccountability');
const Card = require('../models/PropertyCard');
const Item = require('../models/Item');
const { propertyCardHistory } = require('./propertyCardHistory');

// Complete an explicitly identified legacy under-issuance, retaining every
// existing unit and its accountability. Called inside the issuance transaction.
module.exports = async function prepareRisCompletion(ris, { lineId, target }, session) {
  if (!['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(ris.status)) throw new Error('Only an issued RIS can be completed');
  const source = ris.items.id(lineId);
  if (!source || !Number.isInteger(target) || target !== source.quantityRequested || target <= source.quantityIssued) throw new Error('Select the original under-issued request line and its requested quantity');
  const previous = ris.toObject();
  const account = await Accountability.findOne({ ris: ris._id, risItem: source._id, deleted: false }).session(session).lean();
  if (account && (!account.active || account.returnedQuantity || account.pendingMovement || String(account.user || account.offlineRecipient) !== String(ris.requestedBy?.user || ris.requestedBy?.offlineRecipient))) throw new Error('Cannot complete a request after its original unit was returned or transferred');
  const stock = await Item.findOne({ stockNumber: source.stockNumber, deleted: false }).session(session).lean();
  if (!stock) throw new Error('Stock item not found');
  const candidates = await Inventory.find({ item: stock._id, deleted: false, status: { $in: ['LOGGED_TO_STOCKS', 'IN_STORAGE', 'IN_STORAGE_AVAILABLE', 'RETURNED'] } }).sort({ createdAt: 1, _id: 1 }).session(session).lean();
  const held = await Accountability.find({ inventory: { $in: candidates.map(row => row._id) }, active: true, deleted: false }).select('inventory').session(session).lean();
  const heldIds = new Set(held.map(row => String(row.inventory)));
  const cards = await Card.find({ deleted: false, 'items.inventory': { $in: candidates.map(row => row._id) } }).session(session).lean();
  const balances = new Map();
  for (const card of cards) for (const row of propertyCardHistory(card).items) balances.set(String(row.inventory), row.balanceQuantity);
  const unit = candidates.find(row => !heldIds.has(String(row._id)) && (!balances.has(String(row._id)) || balances.get(String(row._id)) > 0));
  if (!unit) throw new Error('No available inventory units remain');
  const missing = target - Number(source.quantityIssued || 0);
  if (missing > stock.quantityOnHand) throw new Error('Insufficient stock to complete the approved request');
  await mongoose.connection.collection('sample_record_archives').insertOne({ batchId: new mongoose.Types.ObjectId(), reason: 'Complete legacy RIS under-issuance', collection: ris.constructor.collection.name, originalId: ris._id, recordedAt: new Date(), record: previous, stockBefore: stock }, { session });
  const originalLine = previous.items.find(row => String(row._id) === String(lineId));
  originalLine.quantityRequested = originalLine.quantityIssued;
  const { _id, accountability, issuanceForm, documentNumber, ...base } = source.toObject();
  ris.items = [{ ...base, inventory: unit._id, property: unit.property, serialNumber: unit.serialNumber, quantityRequested: missing, quantityIssued: missing }];
  ris.status = 'APPROVED';
  return previous;
};
