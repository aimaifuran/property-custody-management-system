const express = require('express');
const mongoose = require('mongoose');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const LedgerTransaction = require('../models/LedgerTransaction');
const PropertyCard = require('../models/PropertyCard');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
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
    totalCost: quantity * unitCost,
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

router.put('/:id', authenticate, authorize('canManageIAR'), async (req, res) => {
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
    const stockFields = rows => rows.map(row => [row.stockNumber || row.stockPropertyNumber, Number(row.quantity), Number(row.unitCost || 0), row.itemType || 'ASSET']);
    if (JSON.stringify(stockFields(existing.items)) !== JSON.stringify(stockFields(payload.items))) return errorResponse(res, 'Received stock numbers, quantities, costs and item types are locked. Record additional receipts with a new IAR.', [], 409);
  }
  for (const field of ['status', 'propertyCards', 'requisition', 'inventoryCustodianSlip', 'propertyAcknowledgementReceipt']) delete payload[field];
  if (payload.items) {
    payload.items = payload.items.map(entry => receivedItem(entry));
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

router.post('/', authenticate, authorize('canManageIAR'), async (req, res) => {
  const payload = { ...req.body };
  delete payload.lastEditedAt;
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
      const types = new Map();
      for (const entry of payload.items) {
        if (types.has(entry.stockNumber) && types.get(entry.stockNumber) !== entry.itemType) throw new Error('Use a separate stock number for supplies and assets');
        types.set(entry.stockNumber, entry.itemType);
      }
      if (automaticNumber) payload.iarNumber = await reserveDocumentNumber(InspectionAcceptanceReport, 'iarNumber', new Date(), session);
      else await recordManualIarNumber(payload.iarNumber, session);
      const [report] = await InspectionAcceptanceReport.create([payload], { session });
      const propertyCardItems = [];
      for (const entry of report.items) {
        let item = await Item.findOne({ stockNumber: entry.stockNumber, deleted: false }).session(session);
        if (!item && entry.stockNumber) {
          [item] = await Item.create([{ stockNumber: entry.stockNumber, unit: entry.unit || 'unit', description: entry.description || entry.item || 'Unnamed item', cost: entry.unitCost || 0, itemType: entry.itemType }], { session });
        }
        if (item && (item.itemType || 'ASSET') !== entry.itemType) {
          const inventoryIds = await Inventory.find({ item: item._id, deleted: false }).select('_id').session(session);
          if (await Accountability.exists({ inventory: { $in: inventoryIds.map(row => row._id) }, active: true, deleted: false }).session(session)) throw new Error('Return outstanding assets before changing the stock classification');
          item.itemType = entry.itemType; await item.save({ session });
        }
        let inventory;
        let balanceQuantity = entry.quantity;
        if (item) {
          [inventory] = await Inventory.create([{
            item: item._id,
            serialNumber: entry.serialNumber,
            propertyNumber: entry.propertyNumber,
            quantity: entry.quantity,
            unitCost: entry.unitCost,
            assetCost: entry.totalCost,
            status: 'LOGGED_TO_STOCKS',
            supplier: report.supplier,
            purchaseDate: report.purchaseDate,
            inspectionAcceptanceReport: report._id,
          }], { session });
          const newBalance = item.quantityOnHand + entry.quantity;
          balanceQuantity = newBalance;
          await Item.findByIdAndUpdate(item._id, { $inc: { quantityOnHand: entry.quantity }, $set: { status: 'IN_STORAGE' } }, { session });
          await LedgerTransaction.create([{
            inventory: inventory._id,
            type: 'incoming',
            quantity: entry.quantity,
            reference: report.iarNumber,
            description: 'IAR acceptance',
            runningBalance: newBalance,
          }], { session });
        }
        propertyCardItems.push({
          inventory: inventory?._id,
          propertyNumber: entry.stockPropertyNumber || entry.stockNumber || null,
          description: entry.description || entry.item || null,
          serialNumber: entry.serialNumber || null,
          date: report.acceptanceDate || null,
          referenceParNo: null,
          receiptQuantity: entry.quantity ?? null,
          itdQuantity: null,
          itdOfficeOfficer: null,
          balanceQuantity,
          amount: entry.totalCost ?? null,
          remarks: null,
        });
      }
      const [propertyCard] = await PropertyCard.create([{
        iar: report._id,
        month: report.iarDate ? new Date(report.iarDate).toISOString().slice(0, 7) : null,
        poNumber: report.poNumber || null,
        entityName: report.entityName || null,
        fundCluster: report.fundCluster || null,
        items: propertyCardItems,
      }], { session });
      const [ris] = await RequisitionIssueSlip.create([{
        iar: report._id,
        entityName: report.entityName || null,
        fundCluster: report.fundCluster || null,
        division: null,
        office: null,
        responsibilityCenterCode: report.responsibilityCenterCode || null,
        risNumber: await reserveDocumentNumber(RequisitionIssueSlip, 'risNumber', new Date(), session),
        purpose: null,
        requestedBy: null,
        approvedBy: null,
        issuedBy: null,
        receivedBy: report.custodian ? { name: report.custodian, designation: null, date: null } : null,
        date: report.acceptanceDate || null,
        status: 'DRAFT',
        items: report.items.map((entry) => ({
          stockNumber: entry.stockNumber || null,
          unit: entry.unit || null,
          description: entry.description || entry.item || null,
          quantityRequested: entry.quantity ?? null,
          stockAvailable: null,
          isAvailable: null,
          quantityIssued: null,
          totalCost: entry.totalCost ?? null,
          remarks: null,
        })),
      }], { session });
      report.propertyCards = [propertyCard._id];
      report.requisition = ris._id;

      report.status = 'LOGGED_TO_STOCKS';
      await report.save({ session });

      await ActivityLog.create([{
        user: req.user._id,
        action: 'IAR created',
        details: `IAR ${report.iarNumber} created; Property Card and RIS draft generated`,
        ipAddress: req.ip,
        browser: req.get('user-agent'),
      }], { session });

      return report;
    });
  } catch (error) { return saveError(res, error); }

  return successResponse(res, 'IAR created', report, 201);
});

module.exports = router;
