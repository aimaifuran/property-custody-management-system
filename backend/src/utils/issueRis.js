const mongoose = require('mongoose');
const crypto = require('crypto');
const RIS = require('../models/RequisitionIssueSlip');
const Item = require('../models/Item');
const Inventory = require('../models/Inventory');
const ICS = require('../models/InventoryCustodianSlip');
const PAR = require('../models/PropertyAcknowledgementReceipt');
const Accountability = require('../models/PropertyAccountability');
const Ledger = require('../models/LedgerTransaction');
const PropertyCard = require('../models/PropertyCard');
const ActivityLog = require('../models/ActivityLog');
const { resolveAccount, accountName } = require('./accountLinks');
const { nextDocumentNumber } = require('./documentNumber');

// Approval authorizes issuance; stock and recipient accountability change together.
module.exports = async function issueRis(id, admin, request = {}, { approve = false } = {}) {
  const topology = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    throw new Error('Issuance requires a MongoDB replica set or Atlas connection so stock and user accountability can be saved together. No items were issued.');
  }
  return mongoose.connection.transaction(async session => {
    const ris = await RIS.findOne({ _id: id, deleted: false }).session(session);
    if (!ris) throw new Error('RIS not found');
    if (approve && ['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(ris.status)) return { ris, accountabilities: [] };
    const previousStatus = ris.status;
    const allowed = approve ? ['DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'REVIEWED', 'APPROVED'] : ['APPROVED', 'REVIEWED'];
    if (!allowed.includes(ris.status)) throw new Error('RIS must be approved before issuance');
    if (approve && (!ris.items.length || ris.items.some(row => !String(row.description || '').trim() || !Number.isInteger(Number(row.quantityRequested)) || Number(row.quantityRequested) <= 0))) throw new Error('Enter requested items with descriptions and positive whole quantities before approval');
    // Updating the RIS inside the transaction also prevents concurrent double issuance.
    ris.status = 'ACCOUNTABILITY_LOCKED';
    await ris.save({ session });
    const requester = await resolveAccount(ris.requestedBy?.name || ris.requestedBy?.user ? ris.requestedBy.toObject() : ris.receivedBy?.toObject());
    if (!requester?.name) throw new Error('Select the requesting employee before issuance');
    if (ris.requestedBy?.name && !requester.user) throw new Error('Link Requested by to a user account before issuance');
    const issuedAt = new Date();
    const issuer = { name: accountName(admin), position: admin.office || 'Supply Officer', date: issuedAt };
    const recipient = { name: requester.name, position: requester.designation || ris.office, date: issuedAt };
    const groups = { ICS: [], PAR: [] };
    const required = new Map();
    for (const row of ris.items) {
      const quantity = Number(approve && ['DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED'].includes(previousStatus) && !row.quantityIssued ? row.quantityRequested : row.quantityIssued ?? row.quantityRequested);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > Number(row.quantityRequested)) throw new Error('Issued quantities must be whole numbers within the requested quantity');
      if (!quantity) continue;
      const item = await Item.findOne({ stockNumber: row.stockNumber, deleted: false }).session(session);
      if (!item) throw new Error(`Stock number "${row.stockNumber || ''}" was not found in inventory`);
      const inventory = await Inventory.findOne({ item: item._id, deleted: false }).sort({ createdAt: -1 }).session(session);
      if (!inventory) throw new Error(`Inventory record not found for ${row.stockNumber}`);
      const total = (required.get(String(item._id)) || 0) + quantity;
      required.set(String(item._id), total);
      if (total > item.quantityOnHand) throw new Error(`Insufficient stock for ${row.stockNumber}`);
      const unitCost = Number(inventory.unitCost ?? item.cost);
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error(`Set the unit cost for ${row.stockNumber} before issuance`);
      const formType = unitCost < 50000 ? 'ICS' : 'PAR';
      groups[formType].push({ row, item, inventory, quantity, unitCost });
    }
    if (!groups.ICS.length && !groups.PAR.length) throw new Error('No available items to issue');
    const accountabilities = [];
    for (const type of ['ICS', 'PAR']) {
      const rows = groups[type];
      if (!rows.length) continue;
      const Model = type === 'ICS' ? ICS : PAR;
      const field = type === 'ICS' ? 'icsNumber' : 'parNumber';
      const documentNumber = await nextDocumentNumber(Model, field, issuedAt, session);
      const [form] = await Model.create([{
        ris: ris._id, iar: ris.iar, user: requester.user, entityName: ris.entityName,
        fundCluster: ris.fundCluster, office: ris.office, [field]: documentNumber,
        receivedBy: recipient, ...(type === 'ICS' ? { receivedFrom: issuer } : { issuedBy: issuer }),
        remarks: `Issued through RIS ${ris.risNumber}`,
        items: rows.map(({ row, item, inventory, quantity, unitCost }) => type === 'ICS' ? {
          quantity, unit: row.unit || item.unit, description: row.description || item.description,
          unitCost, totalCost: quantity * unitCost, inventoryItemNo: inventory.propertyNumber || row.stockNumber,
        } : {
          quantity, unit: row.unit || item.unit, description: row.description || item.description,
          propertyNumber: inventory.propertyNumber || row.stockNumber,
          dateAcquired: inventory.purchaseDate, amount: quantity * unitCost,
        }),
      }], { session });
      ris[type === 'ICS' ? 'inventoryCustodianSlip' : 'propertyAcknowledgementReceipt'] = form._id;
      for (const { row, item, inventory, quantity, unitCost } of rows) {
        const updated = await Item.findOneAndUpdate({ _id: item._id, quantityOnHand: { $gte: quantity } }, { $inc: { quantityOnHand: -quantity } }, { returnDocument: 'after', session });
        if (!updated) throw new Error(`Insufficient stock for ${row.stockNumber}`);
        updated.status = updated.quantityOnHand > 0 ? 'IN_STORAGE' : 'ISSUED';
        await updated.save({ session });
        const [accountability] = await Accountability.create([{
          inventory: inventory._id, user: requester.user, ris: ris._id, risItem: row._id, issuanceForm: form._id,
          quantity, employee: requester.name, office: ris.office || requester.designation || 'Supply Office',
          serialNumber: inventory.serialNumber || row.stockNumber, propertyNumber: inventory.propertyNumber,
          issueDate: issuedAt, condition: 'Serviceable', remarks: row.remarks || ris.purpose,
          formType: type, documentNumber, active: true,
          signatureHash: crypto.createHash('sha256').update(JSON.stringify({ ris: String(ris._id), form: String(form._id), item: String(row._id), user: String(requester.user), issuedAt })).digest('hex'),
        }], { session });
        inventory.accountability = accountability._id; inventory.status = 'ACTIVE_IN_USE';
        await inventory.save({ session });
        await Ledger.create([{
          inventory: inventory._id, type: 'outgoing', quantity, reference: ris.risNumber,
          description: `RIS issuance - ${type} ${documentNumber}`, runningBalance: updated.quantityOnHand,
        }], { session });
        await PropertyCard.updateMany({ deleted: false, 'items.inventory': inventory._id }, {
          $push: { items: { inventory: inventory._id, propertyNumber: inventory.propertyNumber || row.stockNumber,
            description: row.description || item.description, date: issuedAt, referenceParNo: documentNumber,
            receiptQuantity: 0, itdQuantity: quantity, itdOfficeOfficer: requester.name,
            balanceQuantity: updated.quantityOnHand, amount: quantity * unitCost, remarks: `RIS ${ris.risNumber}` } },
        }, { session });
        Object.assign(row, { quantityIssued: quantity, unitCost, totalCost: quantity * unitCost,
          formType: type, documentNumber, issuanceForm: form._id, accountability: accountability._id });
        accountabilities.push({ formType: type, documentNumber, formId: form._id, stockNumber: row.stockNumber, quantityIssued: quantity });
      }
    }
    ris.requestedBy = requester;
    ris.receivedBy = { user: requester.user, name: requester.name, designation: recipient.position, date: issuedAt };
    ris.issuedAt = issuedAt;
    ris.issuedBy = { name: issuer.name, designation: issuer.position, date: issuedAt };
    if (approve) {
      ris.approvedBy = { name: issuer.name, designation: issuer.position, date: issuedAt };
      ris.approvedAt = issuedAt;
      await ActivityLog.create([{ user: admin._id, action: 'RIS approved', details: `RIS ${ris.risNumber} approved and issued to ${requester.name}`, ipAddress: request.ip, browser: request.browser }], { session });
    }
    ris.signatureHash = crypto.createHash('sha256').update(JSON.stringify({ ris: String(ris._id), user: String(requester.user), issuedAt })).digest('hex');
    await ris.save({ session });
    await ActivityLog.create([{ user: admin._id, action: 'RIS issued', details: `RIS ${ris.risNumber} issued to ${requester.name}; linked ICS/PAR generated`, ipAddress: request.ip, browser: request.browser }], { session });
    return { ris, accountabilities };
  });
};
