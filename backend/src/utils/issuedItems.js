const RIS = require('../models/RequisitionIssueSlip');
const Accountability = require('../models/PropertyAccountability');
const PRS = require('../models/PropertyReturnSlip');
const Returned = require('../models/ReturnedSupply');
const Item = require('../models/Item');
const Inventory = require('../models/Inventory');
const User = require('../models/User');
const Offline = require('../models/OfflineRecipient');

// Current holders, including transfer recipients and supplies without ICS/PAR.
module.exports = async function issuedItems() {
  const requests = await RIS.find({ deleted: false, status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } }).sort({ issuedAt: -1 }).lean();
  const ids = requests.map(row => row._id);
  const [accounts, slips, direct, stocks, inventories] = await Promise.all([
    Accountability.find({ deleted: false, ris: { $in: ids } }).lean(),
    PRS.find({ deleted: false, $or: [{ status: 'RETURNED' }, { status: { $exists: false } }], 'items.ris': { $in: ids } }).lean(),
    Returned.find({ deleted: false, prs: null, ris: { $in: ids } }).lean(),
    Item.find({ deleted: false }).select('name description stockNumber category unit itemType').lean(),
    Inventory.find({ deleted: false, _id: { $in: requests.flatMap(ris => ris.items.map(row => row.inventory).filter(Boolean)) } }).select('serialNumber propertyNumber').lean(),
  ]);
  const owners = [...requests.map(row => row.requestedBy || row.receivedBy || {}), ...accounts];
  const [users, offline] = await Promise.all([
    User.find({ _id: { $in: owners.map(row => row.user).filter(Boolean) } }).select('firstName middleName lastName username office').lean(),
    Offline.find({ _id: { $in: owners.map(row => row.offlineRecipient).filter(Boolean) } }).select('name office designation').lean(),
  ]);
  const userMap = new Map(users.map(row => [String(row._id), row]));
  const offlineMap = new Map(offline.map(row => [String(row._id), row]));
  const accountMap = new Map(accounts.map(row => [`${row.ris}:${row.risItem}`, row]));
  const stockMap = new Map(stocks.map(row => [row.stockNumber, row]));
  const inventoryMap = new Map(inventories.map(row => [String(row._id), row]));
  const returned = new Map();
  for (const row of [...slips.flatMap(slip => slip.items), ...direct]) {
    const key = `${row.ris}:${row.risItem}`;
    returned.set(key, (returned.get(key) || 0) + Number(row.quantity || 0));
  }
  const groups = new Map();
  for (const ris of requests) for (const line of ris.items) {
    const account = accountMap.get(`${ris._id}:${line._id}`);
    const quantity = account ? account.active ? Number(account.quantity || 0) - Number(account.returnedQuantity || 0) : 0 : Number(line.quantityIssued || 0) - (returned.get(`${ris._id}:${line._id}`) || 0);
    if (quantity <= 0) continue;
    const owner = account || ris.requestedBy || ris.receivedBy || {};
    const user = userMap.get(String(owner.user));
    const person = offlineMap.get(String(owner.offlineRecipient));
    const name = user ? [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || user.username : person?.name || account?.employee || owner.name || 'Recorded recipient';
    const stock = stockMap.get(line.stockNumber);
    const itemName = stock?.name || line.itemName || (stock?.category !== 'General' ? stock?.category : '') || line.description || 'Unnamed item';
    const key = JSON.stringify([String(itemName).toLowerCase(), stock?.unit || line.unit || '', stock?.itemType || line.formType]);
    const group = groups.get(key) || { id: key, name: itemName, category: stock?.category === 'General' ? '' : stock?.category || '', classification: stock?.itemType || line.formType, unit: stock?.unit || line.unit, quantity: 0, holders: [] };
    const inventory = inventoryMap.get(String(line.inventory));
    const ownerKey = owner.user ? `user:${owner.user}` : owner.offlineRecipient ? `offline:${owner.offlineRecipient}` : `name:${name}:${ris.office}`;
    let holder = group.holders.find(row => row.id === ownerKey);
    if (!holder) { holder = { id: ownerKey, userId: owner.user, offlineRecipientId: owner.offlineRecipient, name, username: user?.username || '', office: account?.office || person?.office || user?.office || ris.office || '', quantity: 0, units: [] }; group.holders.push(holder); }
    holder.quantity += quantity;
    holder.units.push({ id: String(line._id), fundCluster: ris.fundCluster || '', serialNumber: inventory?.serialNumber || line.serialNumber || '', propertyNumber: inventory?.propertyNumber || account?.propertyNumber || '', quantity, issuedAt: account?.issueDate || ris.issuedAt, documentNumber: account?.documentNumber || line.documentNumber || ris.risNumber, formType: account?.formType || line.formType, risId: String(ris._id), risNumber: ris.risNumber });
    group.quantity += quantity;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)).map(group => ({ ...group, holders: group.holders.sort((a, b) => a.name.localeCompare(b.name)) }));
};
