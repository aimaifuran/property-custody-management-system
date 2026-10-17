const mongoose = require('mongoose');
const Card = require('../models/PropertyCard');
const Inventory = require('../models/Inventory');
const RIS = require('../models/RequisitionIssueSlip');
const { propertyCardHistory } = require('./propertyCardHistory');
const { resolveAccount } = require('./accountLinks');
const { reserveDocumentNumber } = require('./documentNumber');

module.exports = async function createCardIssuance(values, session) {
  const { cardId, rowId, quantity, recipient, requestId } = values;
  if (!mongoose.isValidObjectId(cardId) || !mongoose.isValidObjectId(rowId) || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId || '')) throw new Error('Invalid Property Card issuance');
  const key = `${cardId}:${requestId}`;
  const existing = await RIS.findOne({ manualIssueKey: key }).session(session);
  if (existing) return existing;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Enter a positive whole issued quantity');
  const card = await Card.findOne({ _id: cardId, deleted: false }).session(session);
  const row = card?.items.id(rowId);
  if (!row?.inventory) throw new Error('Select a receipt row linked to inventory');
  const history = propertyCardHistory(card).items.filter(item => String(item.inventory) === String(row.inventory));
  if (quantity > (history.at(-1)?.balanceQuantity || 0)) throw new Error('Issued quantity exceeds the remaining Property Card balance');
  const inventory = await Inventory.findOne({ _id: row.inventory, deleted: false }).populate('item').session(session);
  if (!inventory?.item || inventory.item.deleted) throw new Error('Inventory item is unavailable');
  const person = await resolveAccount(recipient);
  if (!person?.user && !person?.offlineRecipient) throw new Error('Select a user account or offline recipient');
  const [ris] = await RIS.create([{
    manualIssueKey: key, sourceInventory: inventory._id,
    iar: card.iar, entityName: card.entityName, fundCluster: card.fundCluster,
    risNumber: await reserveDocumentNumber(RIS, 'risNumber', new Date(), session),
    office: person.designation || 'Supply Office', requestedBy: person, receivedBy: person,
    purpose: 'Manual issuance from Property Card', date: new Date(), status: 'APPROVED',
    items: [{ stockNumber: inventory.item.stockNumber, description: row.description || inventory.item.description,
      unit: inventory.item.unit, quantityRequested: quantity, quantityIssued: quantity }],
  }], { session });
  return ris;
};
