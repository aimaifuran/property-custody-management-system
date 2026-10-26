const { lineAmount } = require('../utils/formAmounts');
const { validateAdminForm } = require('../middlewares/validateAdminForm');
const express = require('express');
const mongoose = require('mongoose');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const LedgerTransaction = require('../models/LedgerTransaction');
const Accountability = require('../models/PropertyAccountability');


const Supplier = require('../models/Supplier');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { listRecords } = require('../utils/paginate');
const { reserveDocumentNumber, recordManualIarNumber, isValidIarNumber, iarNumberError } = require('../utils/documentNumber');
const router = express.Router();

const IAR_SEARCH_FIELDS = [
  'entityName', 'fundCluster', 'supplierName', 'poNumber', 'responsibilityCenterCode',
  'iarNumber', 'invoiceNumber', 'inspectedBy', 'acceptanceStatus', 'custodian',
  'receivedBy', 'acceptedBy',
];

const receivedItem = (entry, stock) => {
  const stockNumber = String(entry.stockNumber || entry.stockPropertyNumber || '').trim();
  const quantity = Number(entry.quantity);
  // Cost is optional on the official IAR. Preserve a real zero for Inventory,
  // whose numeric field rejects an empty input string or an omitted value.
  const unitCost = Number((entry.unitCost === undefined ? stock?.cost : entry.unitCost) || 0);
  return {
    ...entry,
    stockNumber,
    stockPropertyNumber: String(entry.stockPropertyNumber || stockNumber).trim(),
    item: entry.item || entry.description,
    itemType: (entry.itemType === undefined ? stock?.itemType : entry.itemType) || 'ASSET',
    quantity,
    unitCost,
    totalCost: lineAmount(quantity, unitCost),
  };
};

const saveError = (res, error) => {
  if (error.code === 11000 && (error.keyPattern?.iarNumber || error.keyValue?.iarNumber)) {
    return errorResponse(res, 'IAR number already exists. Enter a different IAR number.', [], 409);
  }
  return errorResponse(res, error.message, [], 400);
};

router.get('/', authenticate, authorize(['canViewIAR', 'canManageIAR']), async (req, res) => {
  const iar = await listRecords(InspectionAcceptanceReport, req, { baseFilter: { deleted: false }, searchFields: IAR_SEARCH_FIELDS, populate: 'supplier' });
  return successResponse(res, 'IAR retrieved', iar);
});

router.put('/:id', authenticate, validateAdminForm('iar'), authorize('canManageIAR'), async (req, res) => {
  const payload = { ...req.body, lastEditedAt: new Date() };
  if (Object.keys(payload).some(field => field.startsWith('$') || field.includes('.'))) return errorResponse(res, 'Submit IAR form fields directly without update operators.', [], 400);
  if (payload.items && !Array.isArray(payload.items)) return errorResponse(res, 'Enter at least one received item', [], 400);
  const existing = await InspectionAcceptanceReport.findOne({ _id: req.params.id, deleted: false });
  if (!existing) return errorResponse(res, 'IAR not found', [], 404);
  let changedNumber = false;
  if (Object.hasOwn(payload, 'iarNumber')) {
    payload.iarNumber = String(payload.iarNumber ?? '').trim();
    changedNumber = payload.iarNumber !== existing.iarNumber;
    if (changedNumber && !isValidIarNumber(payload.iarNumber)) return errorResponse(res, iarNumberError().message, [], 400);
    // Older formatted numbers remain intact when correcting other details.
    if (!changedNumber) delete payload.iarNumber;
  }
  delete payload.autoNumber;
  if (existing.status === 'LOGGED_TO_STOCKS' && payload.items) {
    const stockFields = rows => rows.map(row => [row.stockPropertyNumber || row.stockNumber, Number(row.quantity), Number(row.unitCost || 0), row.itemType || 'ASSET', row.serialNumber || '', row.acceptedQuantity ?? row.quantity]);
    if (JSON.stringify(stockFields(existing.items)) !== JSON.stringify(stockFields(payload.items.map((entry, index) => ({ ...entry, acceptedQuantity: entry.acceptedQuantity ?? existing.items[index]?.acceptedQuantity ?? entry.quantity }))))) return errorResponse(res, 'Received stock numbers, quantities, costs and item types are locked. Record additional receipts with a new IAR.', [], 409);
  }
  for (const field of ['status', 'propertyCards', 'requisition', 'inventoryCustodianSlip', 'propertyAcknowledgementReceipt']) delete payload[field];
  if (payload.items) {
    payload.items = payload.items.map((entry, index) => ({ ...receivedItem(existing.status === 'LOGGED_TO_STOCKS' ? { ...entry, stockNumber: existing.items[index]?.stockNumber } : entry), serialNumbers: existing.items[index]?.serialNumbers, acceptedQuantity: existing.items[index]?.acceptedQuantity ?? existing.items[index]?.quantity, inventory: existing.items[index]?.inventory, inventories: existing.items[index]?.inventories, property: existing.items[index]?.property }));
  }
  let report;
  try {
    const update = session => InspectionAcceptanceReport.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      payload,
      { returnDocument: 'after', runValidators: true, ...(session ? { session } : {}) },
    );
    report = changedNumber ? await mongoose.connection.transaction(async session => {
      await recordManualIarNumber(payload.iarNumber, session);
      return update(session);
    }) : await update();
  } catch (error) { return saveError(res, error); }
  if (!report) return errorResponse(res, 'IAR not found', [], 404);

  await ActivityLog.create({
    user: req.user._id,
    action: 'IAR updated',
    details: `IAR ${report.iarNumber} updated`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'IAR updated', report);
});

router.post('/', authenticate, validateAdminForm('iar'), authorize('canManageIAR'), async (req, res) => {
  const payload = { ...req.body };
  delete payload.lastEditedAt;
  if (payload.submissionKey) {
    if (typeof payload.submissionKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(payload.submissionKey)) return errorResponse(res, 'Invalid receipt submission key', [], 400);
    const posted = await InspectionAcceptanceReport.findOne({ submissionKey: payload.submissionKey, deleted: false });
    if (posted) return successResponse(res, 'IAR already saved', posted);
  }
  if (payload.status && !['APPROVED', 'LOGGED_TO_STOCKS', 'INSPECTED_ACCEPTED'].includes(payload.status)) return errorResponse(res, 'Only inspected and accepted deliveries can be posted. Draft or rejected IARs cannot add stock.', [], 400);

  const automaticNumber = payload.autoNumber === true || !String(payload.iarNumber || '').trim();
  delete payload.autoNumber;
  if (!automaticNumber) {
    payload.iarNumber = String(payload.iarNumber).trim();
    if (!isValidIarNumber(payload.iarNumber)) return errorResponse(res, iarNumberError().message, [], 400);
  }
  payload.purchaseDate = payload.purchaseDate || payload.poDate || null;
  payload.iarDate = payload.iarDate || payload.date || null;
  // Keep older clients and previously-used field names compatible with the
  // new IAR form while the downstream records use the new names.
  payload.receivedBy = payload.receivedBy || payload.custodian || null;
  payload.acceptedBy = payload.acceptedBy || payload.custodian || null;
  if (!Array.isArray(payload.items) || !payload.items.length || payload.items.some(entry => !entry || typeof entry !== 'object')) return errorResponse(res, 'Enter at least one received item', [], 400);
  const receivedEntries = payload.items;
  for (const entry of receivedEntries) entry.serialNumber = String(entry.serialNumber || '').trim();
  const accepted = receivedEntries.map(entry => {
    if (entry.acceptanceStatus === 'Rejected') return 0;
    if (payload.acceptanceStatus === 'Partial') {
      const value = entry.acceptedQuantity ?? (receivedEntries.length === 1 ? payload.acceptanceQuantity : undefined);
      if (value == null || value === '') return NaN;
      return Number(value);
    }
    return Number(entry.quantity);
  });
  if (accepted.some((quantity, index) => !Number.isInteger(quantity) || quantity < 0 || quantity > Number(receivedEntries[index].quantity)) || !accepted.some(quantity => quantity > 0)) return errorResponse(res, 'Enter the accepted quantity for each partially accepted item; it must be between zero and its delivered quantity', [], 400);
  if (payload.acceptanceStatus === 'Partial') payload.acceptanceQuantity = accepted.reduce((sum, quantity) => sum + quantity, 0);
  receivedEntries.forEach((entry, index) => { entry.acceptedQuantity = accepted[index]; });
  payload.items = receivedEntries.map(entry => receivedItem(entry));
  if (payload.supplier && typeof payload.supplier === 'string' && payload.supplier.trim()) {
    const supplier = await Supplier.findOne({ name: payload.supplier.trim(), deleted: false });
    if (supplier) {
      payload.supplier = supplier._id;
      payload.supplierName = payload.supplierName || supplier.name;
    } else {
      payload.supplierName = payload.supplierName || payload.supplier;
      delete payload.supplier;
    }
  }
  for (const [index, entry] of payload.items.entries()) {
    const item = `Item ${index + 1}`;
    if (!entry.stockNumber) return errorResponse(res, `${item}: enter a stock/property number`, [], 400);
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) return errorResponse(res, `${item}: enter a positive whole quantity`, [], 400);
    if (!Number.isFinite(entry.unitCost) || entry.unitCost < 0) return errorResponse(res, `${item}: enter a valid unit cost of zero or more`, [], 400);
    if (!['SUPPLY', 'ASSET'].includes(entry.itemType)) return errorResponse(res, `${item}: select Supply or Asset`, [], 400);
  }
  let report;
  try {
    report = await mongoose.connection.transaction(async session => {
      // The official IAR does not collect classification or cost. Reuse known
      // stock metadata when omitted, while preserving explicit legacy values.
      const stocks = await Item.find({ stockNumber: { $in: payload.items.map(entry => entry.stockNumber) }, deleted: false }).session(session);
      const stockMap = new Map(stocks.map(stock => [stock.stockNumber, stock]));
      payload.items = receivedEntries.map(entry => receivedItem(entry, stockMap.get(String(entry.stockNumber || entry.stockPropertyNumber || '').trim())));
      if (payload.items.reduce((sum, entry) => sum + (entry.itemType === 'ASSET' || entry.serialNumber ? (entry.acceptedQuantity ?? entry.quantity) : 1), 0) > 500) throw new Error('Use at most 500 asset units per IAR');
      for (const entry of payload.items) {
        if (!Number.isFinite(entry.unitCost) || entry.unitCost < 0) throw new Error(`Set a valid unit cost for ${entry.stockNumber}`);
        if (!['SUPPLY', 'ASSET'].includes(entry.itemType)) throw new Error(`Select Supply or Asset for ${entry.stockNumber}`);
      }
      if (automaticNumber) payload.iarNumber = await reserveDocumentNumber(InspectionAcceptanceReport, 'iarNumber', new Date(), session);
      else await recordManualIarNumber(payload.iarNumber, session);
      const [report] = await InspectionAcceptanceReport.create([payload], { session });
      for (const entry of report.items) {
        const acceptedQuantity = entry.acceptedQuantity ?? entry.quantity;
        if (!acceptedQuantity) continue;
        let item = await Item.findOne({ stockNumber: entry.stockNumber, deleted: false }).session(session);
        const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
        // The printed IAR row number can repeat. Keep catalog identities separate
        // when that number was used for a different item or a deleted catalog row.
        const sameItem = candidate => candidate && normalize(candidate.description) === normalize(entry.description || entry.item)
          && normalize(candidate.unit) === normalize(entry.unit)
          && (candidate.itemType || 'ASSET') === entry.itemType
          && (!entry.propertyPlantAndEquipment || candidate.category === 'General' || normalize(candidate.name || candidate.category) === normalize(entry.propertyPlantAndEquipment));
        if (item && !sameItem(item)) item = null;
        if (!item && entry.stockNumber) {
          const occupied = await Item.exists({ stockNumber: entry.stockNumber }).session(session);
          const catalogNumber = occupied ? `${entry.stockNumber}~${entry._id}` : entry.stockNumber;
          [item] = await Item.create([{ stockNumber: catalogNumber, displayStockNumber: entry.stockPropertyNumber || entry.stockNumber, name: entry.propertyPlantAndEquipment || undefined, unit: entry.unit || 'unit', description: entry.description || entry.item || 'Unnamed item', cost: entry.unitCost || 0, itemType: entry.itemType, category: entry.propertyPlantAndEquipment || 'General' }], { session });
        }
        entry.stockNumber = item.stockNumber;
        if (item && (item.itemType || 'ASSET') !== entry.itemType) throw new Error('Use a separate stock number for a different stock classification');
        if (item && item.unit.trim().toLowerCase() !== String(entry.unit || '').trim().toLowerCase()) throw new Error('Use a separate stock number for a different unit of measure');
        if (entry.propertyPlantAndEquipment && item.category !== 'General' && item.category.trim().toLowerCase() !== entry.propertyPlantAndEquipment.trim().toLowerCase()) throw new Error('Use a separate stock number for a different property category');
        if (!item.name && entry.propertyPlantAndEquipment) { item.name = entry.propertyPlantAndEquipment.trim(); await item.save({ session }); }
        if (item.category === 'General' && entry.propertyPlantAndEquipment) { item.category = entry.propertyPlantAndEquipment.trim(); await item.save({ session }); }
        // Later receipts without visible cost fields reuse the latest recorded
        // stock cost. Each inventory receipt still retains its own original cost.
        if (item && item.cost !== entry.unitCost) {
          item.cost = entry.unitCost;
          await item.save({ session });
        }
        const individuallyTracked = entry.itemType === 'ASSET' || !!entry.serialNumber;
        const unitCount = individuallyTracked ? acceptedQuantity : 1;
        const serialNumbers = await require('../utils/allocateUnitSerials')(entry.serialNumber, acceptedQuantity, session);
        entry.serialNumbers = serialNumbers;
        const requestedPropertyNumber = entry.propertyNumber;
        for (let unitIndex = 0; unitIndex < unitCount; unitIndex++) {
        const receiptQuantity = individuallyTracked ? 1 : acceptedQuantity;
        const unitSerial = serialNumbers[unitIndex] || undefined;
        let inventory;
        if (item) {
          [inventory] = await Inventory.create([{
            item: item._id,
            serialNumber: unitSerial,
            propertyNumber: unitCount === 1 ? requestedPropertyNumber : undefined,
            quantity: receiptQuantity,
            unitCost: entry.unitCost,
            assetCost: lineAmount(receiptQuantity, entry.unitCost),
            status: 'LOGGED_TO_STOCKS',
            supplier: report.supplier,
            purchaseDate: report.purchaseDate,
            inspectionAcceptanceReport: report._id,
          }], { session });
          if (entry.itemType === 'ASSET') {
            if (unitCount === 1 && requestedPropertyNumber && await Inventory.exists({ _id: { $ne: inventory._id }, propertyNumber: requestedPropertyNumber }).session(session)) throw new Error('Each asset must have a unique property number');
            const [property] = await require('../models/Property').create([{
              propertyCode: `P-${inventory._id}`, inventory: inventory._id, iar: report._id,
              propertyName: entry.propertyPlantAndEquipment || entry.description,
              description: entry.description, category: entry.propertyPlantAndEquipment || 'Other Property',
              serialNumber: unitSerial, quantity: receiptQuantity,
              acquisitionDate: report.acceptanceDate || report.poDate, acquisitionCost: lineAmount(receiptQuantity, entry.unitCost),
              supplier: report.supplierName, purchaseOrderNumber: report.poNumber, sourceOfFund: report.fundCluster,
              status: 'AVAILABLE', events: [{ action: 'IAR receipt', status: 'AVAILABLE', remarks: report.iarNumber }],
            }], { session });
            inventory.property = property._id;
            inventory.propertyNumber = inventory.propertyNumber || property.propertyCode;
            await inventory.save({ session });
            if (unitIndex === 0) { entry.property = property._id; entry.propertyNumber = inventory.propertyNumber; }
          }
          if (unitIndex === 0) entry.inventory = inventory._id;
          entry.inventories.push(inventory._id);
          const newBalance = item.quantityOnHand + receiptQuantity;
          await Item.findByIdAndUpdate(item._id, { $inc: { quantityOnHand: receiptQuantity }, $set: { status: 'IN_STORAGE' } }, { session });
          item.quantityOnHand = newBalance;
          await LedgerTransaction.create([{
            inventory: inventory._id,
            sourceType: 'IAR', sourceDocument: report._id, sourceLine: entry._id, sourceKey: `IAR:${report._id}:${entry._id}:${inventory._id}`, postedBy: req.user._id, transactionDate: new Date(),
            type: 'incoming',
            quantity: receiptQuantity,
            reference: report.iarNumber,
            description: 'IAR acceptance',
            runningBalance: newBalance,
          }], { session });
        }
        }
      }
      report.status = 'LOGGED_TO_STOCKS';
      await report.save({ session });

      await ActivityLog.create([{
        user: req.user._id,
        action: 'IAR created',
        details: `IAR ${report.iarNumber} created; stock and RIS draft recorded`,
        ipAddress: req.ip,
        browser: req.get('user-agent'),
      }], { session });

      return report;
    });
  } catch (error) {
    if (error.code === 11000 && payload.submissionKey) {
      const existing = await InspectionAcceptanceReport.findOne({ submissionKey: payload.submissionKey });
      if (existing) return successResponse(res, 'IAR already saved', existing);
    }
    return saveError(res, error);
  }

  return successResponse(res, 'IAR created', report, 201);
});

module.exports = router;
