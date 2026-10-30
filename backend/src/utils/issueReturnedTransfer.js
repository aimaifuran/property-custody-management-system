const Accountability = require('../models/PropertyAccountability');
const PRS = require('../models/PropertyReturnSlip');
const RIS = require('../models/RequisitionIssueSlip');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Ledger = require('../models/LedgerTransaction');
const { reserveDocumentNumber } = require('./documentNumber');
const { accountName } = require('./accountLinks');
const reassign = require('./reassignAccountability');

const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };

// A PRS-based PTR reissues returned stock into a new custody period. The old
// accountability and its return receipts must remain intact.
module.exports = async function issueReturnedTransfer(report, actor, session) {
  if (!['RECORDED', 'APPROVED'].includes(report.status)) return;
  const receiver = await User.findOne({ _id: report.toUser, deleted: false, role: 'user' }).session(session);
  if (!receiver) fail('Transfer recipient is unavailable');
  let changed = false;
  for (const entry of report.items) {
    if (!entry.returnSlip || entry.accountability) continue;
    const sourceKey = `PTR:${report._id}:${entry._id}`;
    const prior = await Accountability.findOne({ transferSource: sourceKey }).session(session);
    if (prior) { entry.accountability = prior._id; changed = true; continue; }
    const slip = await PRS.findOne({ _id: entry.returnSlip, deleted: false, status: 'RETURNED', stockPosted: true }).session(session);
    const line = slip?.items.id(entry.returnSlipItem);
    if (!line || (line.condition || 'Serviceable') !== 'Serviceable') fail(`${report.ptrNumber}: only received serviceable PRS items can be transferred`);
    if (!report.fromUser) report.fromUser = slip.returnedBy?.user || slip.submittedBy;
    const source = line.accountability ? await Accountability.findById(line.accountability).session(session) : null;
    const sourceRis = line.ris ? await RIS.findById(line.ris).session(session) : null;
    const sourceItem = sourceRis?.items.id(line.risItem);
    const inventory = await Inventory.findOne({ _id: entry.inventory || source?.inventory || sourceItem?.inventory, deleted: false }).populate('item').session(session);
    if (!inventory?.item) fail(`${report.ptrNumber}: the source inventory could not be found`);
    const quantity = Number(entry.quantity || line.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > Number(line.quantity)) fail('Invalid transferred quantity');
    if ((inventory.serialNumber || inventory.quantity === 1) && await Accountability.exists({ inventory: inventory._id, deleted: false, active: true }).session(session)) fail(`${report.ptrNumber}: this asset is already assigned to a custodian`);
    const stock = await Item.findOneAndUpdate({ _id: inventory.item._id, deleted: false, quantityOnHand: { $gte: quantity } }, { $inc: { quantityOnHand: -quantity } }, { returnDocument: 'after', session });
    if (!stock) fail(`${report.ptrNumber}: insufficient returned stock to establish custody`);
    const date = report.date || report.createdAt || new Date();
    const person = { user: receiver._id, name: accountName(receiver), designation: receiver.office, date };
    const [ris] = await RIS.create([{
      manualIssueKey: sourceKey, sourceInventory: inventory._id,
      risNumber: await reserveDocumentNumber(RIS, 'risNumber', date, session),
      entityName: report.entityName, fundCluster: report.fundCluster, office: receiver.office,
      purpose: `Reissued through PTR ${report.ptrNumber}`, status: 'ISSUED', issuedAt: date, totalQuantity: quantity,
      requestedBy: person, receivedBy: person,
      items: [{ inventory: inventory._id, itemName: inventory.item.name, stockNumber: inventory.item.stockNumber,
        description: entry.description || line.description, unit: inventory.item.unit,
        quantityRequested: quantity, quantityIssued: quantity, unitCost: inventory.unitCost }],
    }], { session });
    const formType = source?.formType || (Number(inventory.unitCost) < 50000 ? 'ICS' : 'PAR');
    const row = new Accountability({ transferSource: sourceKey, inventory: inventory._id, property: inventory.property,
      user: report.fromUser || slip.returnedBy?.user, employee: report.fromAccountableOfficer || slip.returnedBy?.name,
      office: receiver.office, quantity, returnedQuantity: 0, issueDate: date,
      serialNumber: inventory.serialNumber, formType, documentNumber: report.ptrNumber, propertyNumber: entry.propertyNumber || inventory.propertyNumber,
      ris: ris._id, risItem: ris.items[0]._id, condition: 'Serviceable' });
    inventory.item.quantityOnHand = stock.quantityOnHand;
    row.inventory = inventory;
    await reassign({ row, receiver, report, entry, actor, session, date, acceptedAt: date });
    Object.assign(ris.items[0], { accountability: row._id, formType, issuanceForm: row.issuanceForm, documentNumber: row.documentNumber });
    ris[formType === 'ICS' ? 'inventoryCustodianSlip' : 'propertyAcknowledgementReceipt'] = row.issuanceForm;
    await ris.save({ session });
    changed = true;
    entry.accountability = row._id;
    entry.inventory = inventory._id;
    entry.quantity = quantity;
    stock.status = stock.quantityOnHand > 0 ? 'IN_STORAGE_AVAILABLE' : 'ISSUED';
    await stock.save({ session });
    await Ledger.create([{ sourceType: 'RIS', sourceDocument: ris._id, sourceLine: ris.items[0]._id,
      sourceKey, postedBy: actor._id, inventory: inventory._id, office: receiver.office, type: 'outgoing',
      quantity, reference: report.ptrNumber, description: 'Returned stock reissued through PTR', runningBalance: stock.quantityOnHand }], { session });
  }
  if (!changed) return;
  await report.save({ session });
  await ActivityLog.create([{ user: actor._id, action: 'PTR custody recorded', details: `${report.ptrNumber}: returned stock issued to ${accountName(receiver)}` }], { session });
};
