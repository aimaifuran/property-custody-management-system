const Inventory = require('../models/Inventory');
const Card = require('../models/PropertyCard');
const Accountability = require('../models/PropertyAccountability');
const { propertyCardHistory } = require('./propertyCardHistory');

// Requests retain an editable quantity. Issuance links each physical unit to a
// separate line so its serial, valuation and later return stay unambiguous.
module.exports = async function expandRisUnits(ris, session) {
  const explicit = new Set(ris.items.map(row => String(row.inventory || '')).filter(Boolean));
  const allocated = new Set();
  const rows = [];
  for (const entry of ris.items) {
    if (entry.quantityIssued == null) throw new Error('Set the actual issued quantity for each RIS item before issuance');
    const quantity = Number(entry.quantityIssued);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > Number(entry.quantityRequested)) throw new Error('Issued quantities must be whole numbers within the requested quantity');
    const selected = quantity > 1 && entry.inventory ? await Inventory.findOne({ _id: entry.inventory, deleted: false }).session(session).lean() : null;
    if (!selected || !(selected.serialNumber || (selected.property && selected.quantity === 1))) { rows.push(entry); continue; }
    let candidates = await Inventory.find({ item: selected.item, deleted: false, status: { $in: ['LOGGED_TO_STOCKS', 'IN_STORAGE', 'IN_STORAGE_AVAILABLE', 'RETURNED'] }, $or: [{ serialNumber: { $type: 'string', $nin: ['', null] } }, { property: { $ne: null }, quantity: 1 }] }).sort({ createdAt: 1, _id: 1 }).session(session).lean();
    if (selected.inspectionAcceptanceReport) {
      const IAR = require('../models/InspectionAcceptanceReport');
      const receipt = await IAR.findById(selected.inspectionAcceptanceReport).select('fundCluster').session(session).lean();
      if (receipt?.fundCluster) {
        const sources = await IAR.find({ deleted: false, fundCluster: receipt.fundCluster, _id: { $in: candidates.map(unit => unit.inspectionAcceptanceReport).filter(Boolean) } }).select('_id').session(session).lean();
        const sourceIds = new Set(sources.map(source => String(source._id)));
        candidates = candidates.filter(unit => sourceIds.has(String(unit.inspectionAcceptanceReport)));
      }
    }
    const ids = candidates.map(unit => unit._id);
    const cards = await Card.find({ deleted: false, 'items.inventory': { $in: ids } }).session(session).lean();
    const held = await Accountability.find({ inventory: { $in: ids }, deleted: false, active: true, $expr: { $gt: ['$quantity', { $ifNull: ['$returnedQuantity', 0] }] } }).select('inventory').session(session).lean();
    const heldIds = new Set(held.map(row => String(row.inventory)));
    const balances = new Map();
    for (const card of cards) for (const row of propertyCardHistory(card).items) balances.set(String(row.inventory), row.balanceQuantity);
    const available = candidates.filter(unit => !heldIds.has(String(unit._id)) && !allocated.has(String(unit._id)) && (!balances.has(String(unit._id)) || balances.get(String(unit._id)) >= 1));
    const first = available.find(unit => String(unit._id) === String(selected._id));
    if (!first) throw new Error('The selected serialized asset or property unit is already issued or unavailable');
    const units = [first, ...available.filter(unit => String(unit._id) !== String(first._id) && !explicit.has(String(unit._id)))].slice(0, quantity);
    if (units.length !== quantity) throw new Error(`Insufficient available units for ${entry.itemName || entry.stockNumber}`);
    const original = entry.toObject();
    units.forEach((unit, index) => {
      allocated.add(String(unit._id));
      const row = { ...original, inventory: unit._id, property: unit.property, serialNumber: unit.serialNumber, quantityRequested: index ? 1 : Number(entry.quantityRequested) - quantity + 1, quantityIssued: 1 };
      if (index) delete row._id;
      rows.push(row);
    });
  }
  ris.items = rows;
};
