const crypto = require('crypto');
const Inventory = require('../models/Inventory');
const Sequence = require('../models/DocumentSequence');

// Reserve unit suffixes inside the receipt transaction. Retries roll back together
// with stock, and the existing counter collection serializes competing receipts.
module.exports = async function allocateUnitSerials(value, quantity, session) {
  const base = String(value || '').trim();
  if (!base || !quantity) return [];
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await Inventory.find({ serialNumber: new RegExp(`^${escaped}-[0-9]+$`, 'i') }).select('serialNumber').session(session).lean();
  const highest = existing.reduce((max, row) => Math.max(max, Number(row.serialNumber.slice(base.length + 1)) || 0), 0);
  const key = `unit-serial:${crypto.createHash('sha256').update(base.toLowerCase()).digest('hex')}`;
  await Sequence.findOneAndUpdate({ _id: key }, { $max: { sequence: highest } }, { upsert: true, session });
  const counter = await Sequence.findOneAndUpdate({ _id: key }, { $inc: { sequence: quantity } }, { returnDocument: 'after', session });
  return Array.from({ length: quantity }, (_, index) => `${base}-${counter.sequence - quantity + index + 1}`);
};
