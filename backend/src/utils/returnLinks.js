const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const { resolveAccount, ownerFilter, linkLegacyRequests } = require('./accountLinks');

// Connect typed admin returns to the exact issued line under the chosen account.
const linkReturnItems = async payload => {
  await linkLegacyRequests();
  payload.returnedBy = await resolveAccount(payload.returnedBy);
  let account = payload.returnedBy?.user;
  for (const entry of payload.items || []) {
    if (!entry.ris) delete entry.ris;
    if (!entry.risItem) delete entry.risItem;
    if (entry.ris && entry.risItem) {
      const record = await RequisitionIssueSlip.findById(entry.ris);
      const issued = record?.items.id(entry.risItem);
      if (issued) { entry.description = issued.description; entry.unit = issued.unit; entry.mrNumber = record.risNumber; }
      if (!account) {
        const owner = record?.requestedBy?.user || record?.receivedBy?.user;
        if (owner) { payload.returnedBy = await resolveAccount({ ...payload.returnedBy, user: owner }); account = owner; }
      }
      if (account && !await RequisitionIssueSlip.exists({ _id: entry.ris, ...ownerFilter(account) })) throw new Error('The selected issued item belongs to a different user account');
      continue;
    }
    if (!account) continue;
    const records = await RequisitionIssueSlip.find({ deleted: false, ...ownerFilter(account), status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] }, ...(entry.mrNumber ? { risNumber: entry.mrNumber } : {}) });
    const matches = records.flatMap(record => record.items.filter(item => item.quantityIssued > 0 && String(item.description || '').trim().toLowerCase() === String(entry.description || '').trim().toLowerCase()).map(item => ({ record, item })));
    if (!matches.length) throw new Error('No matching issued item was found under this user account. Select an issued item; a pending RIS request must be issued before it can be returned.');
    if (matches.length > 1) throw new Error('More than one issuance matches this item. Select the exact RIS item in the issued-item dropdown.');
    entry.ris = matches[0].record._id;
    entry.risItem = matches[0].item._id;
    entry.mrNumber = matches[0].record.risNumber;
    entry.description = matches[0].item.description;
    entry.unit = matches[0].item.unit;
  }
};

// Explicit item references prevent returns from being assigned by description or name.
const validateLinks = async (items, excludeId) => {
  const totals = new Map();
  for (const entry of items || []) {
    if (!entry.ris && !entry.risItem) continue;
    const ris = await RequisitionIssueSlip.findOne({ _id: entry.ris, deleted: false, status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } });
    const item = ris?.items.id(entry.risItem);
    if (!item || !(item.quantityIssued > 0)) throw new Error('Select a valid issued RIS item');
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Returned quantity must be greater than zero');
    const key = `${entry.ris}:${entry.risItem}`;
    totals.set(key, (totals.get(key) || 0) + quantity);
    const previous = await PropertyReturnSlip.find({ deleted: false, $or: [{ status: 'RETURNED' }, { status: { $exists: false } }], ...(excludeId ? { _id: { $ne: excludeId } } : {}), 'items.ris': entry.ris });
    const returned = previous.reduce((sum, slip) => sum + slip.items.filter(row => String(row.ris) === String(entry.ris) && String(row.risItem) === String(entry.risItem)).reduce((count, row) => count + Number(row.quantity || 0), 0), 0);
    const supplies = await ReturnedSupply.find({ deleted: false, prs: null, ris: entry.ris, risItem: entry.risItem, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    const directReturned = supplies.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    if (returned + directReturned + totals.get(key) > item.quantityIssued) throw new Error(`Returned quantity exceeds issued quantity for ${item.description || item.stockNumber}`);
  }
};

module.exports = { linkReturnItems, validateLinks };
