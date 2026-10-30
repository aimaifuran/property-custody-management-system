const { lineAmount } = require('./formAmounts');
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
const { reserveDocumentNumber } = require('./documentNumber');
const { notifyAdmins, notifyUsers } = require('./workflowNotifications');
const { queueWorkflowEmail, deliverWorkflowEmails } = require('./workflowEmails');

async function ensureIssuedPropertyCard(inventory, item, session, sourceReport) {
  const report = sourceReport || inventory.inspectionAcceptanceReport;
  const iarItem = report?.items?.find(entry =>
    String(entry.inventory?._id || entry.inventory || '') === String(inventory._id)
    || (entry.inventories || []).some(unit => String(unit?._id || unit) === String(inventory._id))
  );
  const card = await PropertyCard.findOne({ stockItem: item._id, deleted: false }).session(session);
  if (card?.items?.some(row => String(row.inventory?._id || row.inventory || '') === String(inventory._id))) return;
  const receipt = {
    sourceType: 'IAR', sourceDocument: report?._id || inventory.inspectionAcceptanceReport,
    sourceDate: report?.acceptanceDate || report?.iarDate || inventory.purchaseDate,
    inventory: inventory._id, property: inventory.property, serialNumber: inventory.serialNumber,
    propertyNumber: inventory.propertyNumber || item.stockNumber,
    propertyPlantAndEquipment: iarItem?.propertyPlantAndEquipment || item.name || item.category,
    description: iarItem?.description || iarItem?.item || item.description,
    date: report?.acceptanceDate || report?.iarDate || inventory.purchaseDate,
    receiptQuantity: Number(inventory.quantity || 0), itdQuantity: 0,
    balanceQuantity: Number(inventory.quantity || 0), unitCost: Number(inventory.unitCost ?? item.cost),
    amount: lineAmount(Number(inventory.quantity || 0), Number(inventory.unitCost ?? item.cost)),
    remarks: report?.iarNumber ? `IAR ${report.iarNumber}` : 'IAR receipt',
  };
  if (card) {
    card.items.push(receipt);
    if (!card.iar && report?._id) card.iar = report._id;
    await card.save({ session });
    return;
  }
  await PropertyCard.create([{
    stockItem: item._id, iar: report?._id, month: report?.iarDate ? new Date(report.iarDate).toISOString().slice(0, 7) : null,
    poNumber: report?.poNumber, entityName: report?.entityName, fundCluster: report?.fundCluster,
    propertyPlantAndEquipment: receipt.propertyPlantAndEquipment,
    propertyNumber: receipt.propertyNumber, description: receipt.description,
    serialNumber: inventory.serialNumber || null, items: [receipt],
  }], { session });
}

// Approval authorizes issuance; stock and recipient accountability change together.
const issueRis = async function issueRis(id, admin, request = {}, { approve = false, manualIssue, completeQuantity, silent = false } = {}) {
  const topology = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    throw new Error('Issuance requires a MongoDB replica set or Atlas connection so stock and user accountability can be saved together. No items were issued.');
  }
  const result = await mongoose.connection.transaction(async session => {
    const ris = manualIssue ? await require('./createCardIssuance')(manualIssue, session) : await RIS.findOne({ _id: id, deleted: false }).session(session);
    if (!ris) throw new Error('RIS not found');
    const priorIssuance = completeQuantity ? await require('./prepareRisCompletion')(ris, completeQuantity, session) : null;
    if (approve && ['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(ris.status)) return { ris, accountabilities: [] };
    const allowed = approve ? ['DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'REVIEWED', 'APPROVED'] : ['APPROVED', 'REVIEWED'];
    if (!allowed.includes(ris.status)) throw new Error('RIS must be approved before issuance');
    if (!completeQuantity) await require('./validateRequestedStock')(ris.items, session);
    if (approve && (!ris.items.length || ris.items.some(row => !String(row.description || '').trim() || !Number.isInteger(Number(row.quantityRequested)) || Number(row.quantityRequested) <= 0))) throw new Error('Enter requested items with descriptions and positive whole quantities before approval');
    await require('./expandRisUnits')(ris, session);
    const sourceFunds = await require('./resolveRisItemFunds')(ris.items.map(row => row.toObject()), ris.fundCluster, session);
    ris.fundCluster = sourceFunds.fundCluster;
    if (sourceFunds.responsibilityCenterCode) ris.responsibilityCenterCode = sourceFunds.responsibilityCenterCode;
    // Updating the RIS inside the transaction also prevents concurrent double issuance.
    ris.status = 'ACCOUNTABILITY_LOCKED';
    await ris.save({ session });
    const recipientRecord = ris.receivedBy?.user || ris.receivedBy?.offlineRecipient || ris.receivedBy?.name
      ? ris.receivedBy.toObject()
      : ris.requestedBy?.toObject();
    const recipientAccount = await resolveAccount(recipientRecord);
    if (!recipientAccount?.name) throw new Error('Select the receiving employee before issuance');
    if (!recipientAccount.user && !recipientAccount.offlineRecipient) throw new Error('Select a user account or offline recipient before issuance');
    const issuedAt = new Date();
    const settings = await require('../models/Setting').findOne().sort({ createdAt: 1 }).session(session).lean();
    const configured = require('./formSignatories').formSignatories(settings || {});
    const official = (form, role, fallback) => {
      const saved = configured[form]?.[role];
      return saved?.name ? { ...fallback, name: saved.name, position: saved.designation || fallback.position } : fallback;
    };

    const issuer = { name: accountName(admin), position: admin.position || admin.office || 'Supply Officer', date: issuedAt };
    const recipient = { name: recipientAccount.name, position: recipientAccount.designation || ris.office, date: issuedAt };
    const groups = { SUPPLY: [], ICS: [], PAR: [] };
    const required = new Map();
    const selectedUnits = new Set();
    for (const row of ris.items) {
      // A recorded zero means this row is not issued; actual quantity is explicit.
      if (row.quantityIssued == null) throw new Error('Set the actual issued quantity for each RIS item before issuance');
      const quantity = Number(row.quantityIssued);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > Number(row.quantityRequested)) throw new Error('Issued quantities must be whole numbers within the requested quantity');
      if (!quantity) continue;
      const item = await Item.findOne({ stockNumber: row.stockNumber, deleted: false }).session(session);
      if (!item) throw new Error(`Stock number "${row.stockNumber || ''}" was not found in inventory`);
      // Keep cost, property identity and purchase date with the source receipt.
      // Standalone requests still use the latest recorded inventory metadata.
      let inventory = await Inventory.findOne({ item: item._id, deleted: false, ...(row.inventory || ris.sourceInventory ? { _id: row.inventory || ris.sourceInventory } : ris.iar ? { inspectionAcceptanceReport: ris.iar } : {}) }).sort({ createdAt: -1, _id: -1 }).populate('inspectionAcceptanceReport').session(session);
      // Added stock may come from another receipt. Existing source rows keep their original valuation.
      if (!inventory && ris.iar && !ris.sourceInventory && !row.inventory) inventory = await Inventory.findOne({ item: item._id, deleted: false }).sort({ createdAt: -1, _id: -1 }).populate('inspectionAcceptanceReport').session(session);
      if (!inventory) throw new Error(`Inventory record not found for ${row.stockNumber}`);
      if (!row.inventory && !ris.sourceInventory && await Inventory.exists({ item: item._id, deleted: false, serialNumber: { $type: 'string', $nin: ['', null] } }).session(session)) throw new Error(`Select the exact asset unit for ${row.stockNumber} before issuance`);
      if (inventory.serialNumber || (inventory.property && inventory.quantity === 1)) {
        if (quantity !== 1 || selectedUnits.has(String(inventory._id))) throw new Error('Select a separate asset unit for each issued item, with quantity 1');
        selectedUnits.add(String(inventory._id));
        const card = await PropertyCard.findOne({ deleted: false, 'items.inventory': inventory._id }).session(session);
        const history = card ? require('./propertyCardHistory').propertyCardHistory(card).items.filter(entry => String(entry.inventory) === String(inventory._id)) : [];
        const outstanding = await Accountability.exists({ inventory: inventory._id, active: true, deleted: false, $expr: { $gt: ['$quantity', { $ifNull: ['$returnedQuantity', 0] }] } }).session(session);
        if (outstanding || !['LOGGED_TO_STOCKS', 'IN_STORAGE', 'IN_STORAGE_AVAILABLE', 'RETURNED'].includes(inventory.status) || (history.length && history.at(-1).balanceQuantity < 1)) throw new Error('The selected serialized asset or property unit is already issued or unavailable');
      }
      row.inventory = inventory._id;
      row.property = inventory.property;
      row.serialNumber = inventory.serialNumber;
      row.itemName = item.name || (item.category !== 'General' ? item.category : '') || item.description;

      const total = (required.get(String(item._id)) || 0) + quantity;
      required.set(String(item._id), total);
      if (total > item.quantityOnHand) throw new Error(`Insufficient stock for ${row.stockNumber}`);
      const unitCost = Number(inventory.unitCost ?? item.cost);
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error(`Set the unit cost for ${row.stockNumber} before issuance`);
      const formType = item.itemType === 'SUPPLY' ? 'SUPPLY' : unitCost < 50000 ? 'ICS' : 'PAR';
      groups[formType].push({ row, item, inventory, quantity, unitCost });
    }
    if (!groups.SUPPLY.length && !groups.ICS.length && !groups.PAR.length) throw new Error('No available items to issue');
    const accountabilities = [];
    for (const { row, item, inventory, quantity, unitCost } of groups.SUPPLY) {
      const updated = await Item.findOneAndUpdate({ _id: item._id, quantityOnHand: { $gte: quantity } }, { $inc: { quantityOnHand: -quantity } }, { returnDocument: 'after', session });
      if (!updated) throw new Error(`Insufficient stock for ${row.stockNumber}`);
      updated.status = updated.quantityOnHand > 0 ? 'IN_STORAGE' : 'ISSUED';
      await updated.save({ session });
      inventory.status = updated.status; await inventory.save({ session });
      await Ledger.create([{ sourceType: 'RIS', sourceDocument: ris._id, sourceLine: row._id, sourceKey: `RIS:${ris._id}:${row._id}`, postedBy: admin._id, office: ris.office, inventory: inventory._id, type: 'outgoing', quantity, reference: ris.risNumber, description: 'RIS supply issuance', runningBalance: updated.quantityOnHand }], { session });
      await ensureIssuedPropertyCard(inventory, item, session);
      await PropertyCard.updateMany({ deleted: false, 'items.inventory': inventory._id }, { $push: { items: { sourceType: 'RIS', sourceDocument: ris._id, sourceDate: ris.date || issuedAt, sourceRemarks: row.remarks || ris.purpose, inventory: inventory._id, property: inventory.property, serialNumber: inventory.serialNumber, propertyNumber: row.stockNumber, description: row.description || item.description, date: issuedAt, receiptQuantity: 0, itdQuantity: quantity, itdOfficeOfficer: recipientAccount.name, balanceQuantity: updated.quantityOnHand, unitCost, amount: lineAmount(quantity, unitCost), remarks: `RIS ${ris.risNumber}` } } }, { session });
      Object.assign(row, { quantityIssued: quantity, unitCost, totalCost: lineAmount(quantity, unitCost), formType: 'SUPPLY', documentNumber: undefined, issuanceForm: undefined, accountability: undefined });
    }
    for (const type of ['ICS', 'PAR']) {
      const rows = groups[type];
      if (!rows.length) continue;
      const Model = type === 'ICS' ? ICS : PAR;
      const field = type === 'ICS' ? 'icsNumber' : 'parNumber';
      const documentNumber = await reserveDocumentNumber(Model, field, issuedAt, session);
      const [form] = await Model.create([{
        ris: ris._id, iar: ris.iar, user: recipientAccount.user, offlineRecipient: recipientAccount.offlineRecipient, entityName: ris.entityName,
        fundCluster: ris.fundCluster, office: ris.office, [field]: documentNumber,
        receivedBy: recipient, ...(type === 'ICS' ? { receivedFrom: official('ics', 'receivedFrom', issuer) } : { issuedBy: official('par', 'issuedBy', issuer) }),
        remarks: `Issued through RIS ${ris.risNumber}`,
        items: rows.map(({ row, item, inventory, quantity, unitCost }) => type === 'ICS' ? {
          inventory: inventory._id, property: inventory.property, serialNumber: inventory.serialNumber,
          quantity, unit: row.unit || item.unit, description: inventory.serialNumber ? `${row.description || item.description} (S/N: ${inventory.serialNumber})` : row.description || item.description,
          unitCost, totalCost: lineAmount(quantity, unitCost), inventoryItemNo: inventory.propertyNumber || row.stockNumber,
        } : {
          inventory: inventory._id, property: inventory.property, serialNumber: inventory.serialNumber,
          quantity, unit: row.unit || item.unit, description: inventory.serialNumber ? `${row.description || item.description} (S/N: ${inventory.serialNumber})` : row.description || item.description,
          propertyNumber: inventory.propertyNumber || row.stockNumber,
          dateAcquired: inventory.purchaseDate, unitCost, amount: lineAmount(quantity, unitCost),
        }),
      }], { session });
      ris[type === 'ICS' ? 'inventoryCustodianSlip' : 'propertyAcknowledgementReceipt'] = form._id;
      for (const { row, item, inventory, quantity, unitCost } of rows) {
        const updated = await Item.findOneAndUpdate({ _id: item._id, quantityOnHand: { $gte: quantity } }, { $inc: { quantityOnHand: -quantity } }, { returnDocument: 'after', session });
        if (!updated) throw new Error(`Insufficient stock for ${row.stockNumber}`);
        updated.status = updated.quantityOnHand > 0 ? 'IN_STORAGE' : 'ISSUED';
        await updated.save({ session });
        const [accountability] = await Accountability.create([{
          inventory: inventory._id, property: inventory.property, user: recipientAccount.user, offlineRecipient: recipientAccount.offlineRecipient, ris: ris._id, risItem: row._id, issuanceForm: form._id,
          quantity, employee: recipientAccount.name, office: ris.office || recipientAccount.designation || 'Supply Office',
          serialNumber: inventory.serialNumber || '', propertyNumber: inventory.propertyNumber || row.stockNumber,
          issueDate: issuedAt, condition: 'Serviceable', remarks: row.remarks || ris.purpose,
          formType: type, documentNumber, active: true,
          signatureHash: crypto.createHash('sha256').update(JSON.stringify({ ris: String(ris._id), form: String(form._id), item: String(row._id), user: String(recipientAccount.user || recipientAccount.offlineRecipient), issuedAt })).digest('hex'),
        }], { session });
        if (inventory.property) await require('../models/Property').findByIdAndUpdate(inventory.property, {
          $set: { status: 'ISSUED', currentCustodian: { name: recipientAccount.name, office: ris.office || recipientAccount.designation, assignedDate: issuedAt } },
          $push: { events: { action: 'Issued', status: 'ISSUED', custodian: recipientAccount.name, office: ris.office, remarks: `${type} ${documentNumber}` } },
        }, { session });
        inventory.accountability = accountability._id; inventory.status = 'ACTIVE_IN_USE';
        await inventory.save({ session });
        await Ledger.create([{
          sourceType: 'RIS', sourceDocument: ris._id, sourceLine: row._id, sourceKey: `RIS:${ris._id}:${row._id}`, postedBy: admin._id, office: ris.office, inventory: inventory._id, type: 'outgoing', quantity, reference: ris.risNumber,
          description: `RIS issuance - ${type} ${documentNumber}`, runningBalance: updated.quantityOnHand,
        }], { session });
        await ensureIssuedPropertyCard(inventory, item, session);
        await PropertyCard.updateMany({ deleted: false, 'items.inventory': inventory._id }, {
          $push: { items: { sourceType: 'RIS', sourceDocument: ris._id, sourceDate: ris.date || issuedAt, sourceRemarks: row.remarks || ris.purpose, inventory: inventory._id, property: inventory.property, serialNumber: inventory.serialNumber, propertyNumber: inventory.propertyNumber || row.stockNumber,
            description: row.description || item.description, date: issuedAt, referenceParNo: documentNumber,
            receiptQuantity: 0, itdQuantity: quantity, itdOfficeOfficer: recipientAccount.name,
            balanceQuantity: updated.quantityOnHand, unitCost, amount: lineAmount(quantity, unitCost), remarks: `RIS ${ris.risNumber}` } },
        }, { session });
        Object.assign(row, { quantityIssued: quantity, unitCost, totalCost: lineAmount(quantity, unitCost),
          formType: type, documentNumber, issuanceForm: form._id, accountability: accountability._id });
        accountabilities.push({ formType: type, documentNumber, formId: form._id, stockNumber: row.stockNumber, quantityIssued: quantity });
      }
    }
    ris.receivedBy = { user: recipientAccount.user, offlineRecipient: recipientAccount.offlineRecipient, name: recipientAccount.name, designation: recipient.position, date: issuedAt };
    ris.issuedAt = issuedAt;
    const configuredIssuer = official('ris', 'issuedBy', issuer);
    ris.issuedBy = { name: configuredIssuer.name, designation: configuredIssuer.position, date: issuedAt };
    if (approve) {
      const approver = official('ris', 'approvedBy', issuer);
      ris.approvedBy = { name: approver.name, designation: approver.position, date: issuedAt };
      ris.approvedAt = issuedAt;
      await ActivityLog.create([{ user: admin._id, action: 'RIS approved', details: `RIS ${ris.risNumber} approved and issued to ${recipientAccount.name}`, ipAddress: request.ip, browser: request.browser }], { session });
    }
    ris.signatureHash = crypto.createHash('sha256').update(JSON.stringify({ ris: String(ris._id), user: String(recipientAccount.user || recipientAccount.offlineRecipient), issuedAt })).digest('hex');
    if (priorIssuance) {
      ris.items = [...priorIssuance.items, ...ris.items.map(row => row.toObject())];
      for (const key of ['issuedAt', 'approvedAt', 'approvedBy', 'issuedBy', 'signatureHash', 'inventoryCustodianSlip', 'propertyAcknowledgementReceipt']) if (priorIssuance[key] != null) ris.set(key, priorIssuance[key]);
      await ActivityLog.create([{ user: admin._id, action: 'RIS quantity completed', details: `RIS ${ris.risNumber}: completed original request quantity ${completeQuantity.target}; prior units retained` }], { session });
    }
    await ris.save({ session });
    const hasAssets = groups.ICS.length || groups.PAR.length;
    if (!silent) {
      await queueWorkflowEmail('ISSUED', ris, session);
      const issuedLines = Object.values(groups).flat().map(({ row, quantity }) => `${row.itemName || row.description} (${quantity})`);
      await notifyUsers([recipientAccount.user], 'Request issued', `RIS ${ris.risNumber} has been issued.${hasAssets ? ' Accept receipt in the ICS/PAR forms.' : ' View your supplies in My Issued Items.'}`, hasAssets ? groups.ICS.length ? '/inventory-custodian' : '/par' : '/my-issued-items', session);
      await notifyAdmins('Items issued to user', `${recipientAccount.name} received ${issuedLines.join(', ')} under RIS ${ris.risNumber}.`, '/users', session);
    }
    await ActivityLog.create([{ user: admin._id, action: 'RIS issued', details: `RIS ${ris.risNumber} issued to ${recipientAccount.name}; linked ICS/PAR generated`, ipAddress: request.ip, browser: request.browser }], { session });
    return { ris, accountabilities };
  });
  if (!silent) await deliverWorkflowEmails();
  return result;
};

issueRis.ensureIssuedPropertyCard = ensureIssuedPropertyCard;
module.exports = issueRis;
