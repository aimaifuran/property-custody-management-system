const express = require('express');
const { body, validationResult } = require('express-validator');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const LedgerTransaction = require('../models/LedgerTransaction');
const PropertyCard = require('../models/PropertyCard');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const Supplier = require('../models/Supplier');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { paginateAndSearch } = require('../utils/paginate');
const router = express.Router();

const IAR_SEARCH_FIELDS = [
  'entityName', 'fundCluster', 'supplierName', 'poNumber', 'responsibilityCenterCode',
  'iarNumber', 'invoiceNumber', 'inspectedBy', 'acceptanceStatus', 'custodian',
  'receivedBy', 'acceptedBy',
];

router.get('/', authenticate, authorize('canViewIAR'), async (req, res) => {
  const { data, pagination } = await paginateAndSearch(InspectionAcceptanceReport, req, {
    baseFilter: { deleted: false },
    searchFields: IAR_SEARCH_FIELDS,
    populate: 'supplier',
  });
  return successResponse(res, 'IAR retrieved', { items: data, pagination });
});

router.put('/:id', authenticate, authorize('canManageIAR'), async (req, res) => {
  const payload = { ...req.body };
  if (payload.items) {
    payload.items = payload.items.map((entry) => ({
      ...entry,
      stockNumber: entry.stockNumber || entry.stockPropertyNumber,
      stockPropertyNumber: entry.stockPropertyNumber || entry.stockNumber,
      item: entry.item || entry.description,
      totalCost: Number(entry.quantity || 0) * Number(entry.unitCost || 0),
    }));
  }
  const report = await InspectionAcceptanceReport.findOneAndUpdate(
    { _id: req.params.id, deleted: false },
    payload,
    { new: true, runValidators: true },
  );
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

router.post('/', authenticate, authorize('canManageIAR'), [
  body('iarNumber').notEmpty().withMessage('IAR number is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const payload = { ...req.body };
  payload.purchaseDate = payload.purchaseDate || payload.poDate || null;
  payload.iarDate = payload.iarDate || payload.date || null;
  // Keep older clients and previously-used field names compatible with the
  // new IAR form while the downstream records use the new names.
  payload.receivedBy = payload.receivedBy || payload.custodian || null;
  payload.acceptedBy = payload.acceptedBy || payload.custodian || null;
  payload.items = (payload.items || []).map((entry) => ({
    ...entry,
    stockNumber: entry.stockNumber || entry.stockPropertyNumber,
    stockPropertyNumber: entry.stockPropertyNumber || entry.stockNumber,
    item: entry.item || entry.description,
    totalCost: Number(entry.quantity || 0) * Number(entry.unitCost || 0),
  }));
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
  const report = await InspectionAcceptanceReport.create(payload);
  const propertyCardItems = [];
  for (const entry of report.items) {
    let item = await Item.findOne({ stockNumber: entry.stockNumber, deleted: false });
    if (!item && entry.stockNumber) {
      item = await Item.create({ stockNumber: entry.stockNumber, unit: entry.unit || 'unit', description: entry.description || entry.item || 'Unnamed item', cost: entry.unitCost || 0 });
    }
    let inventory;
    if (item) {
      inventory = await Inventory.create({
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
      });
      const newBalance = item.quantityOnHand + entry.quantity;
      await Item.findByIdAndUpdate(item._id, { quantityOnHand: newBalance });
      await LedgerTransaction.create({
        inventory: inventory._id,
        type: 'incoming',
        quantity: entry.quantity,
        reference: report.iarNumber,
        description: 'IAR acceptance',
        runningBalance: newBalance,
      });
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
      balanceQuantity: entry.quantity ?? null,
      amount: entry.totalCost ?? null,
      remarks: null,
    });
  }
  const propertyCard = await PropertyCard.create({
    iar: report._id,
    month: report.iarDate ? new Date(report.iarDate).toISOString().slice(0, 7) : null,
    poNumber: report.poNumber || null,
    entityName: report.entityName || null,
    fundCluster: report.fundCluster || null,
    items: propertyCardItems,
  });
  const ris = await RequisitionIssueSlip.create({
    iar: report._id,
    entityName: report.entityName || null,
    fundCluster: report.fundCluster || null,
    division: null,
    office: null,
    responsibilityCenterCode: report.responsibilityCenterCode || null,
    // Omit the number on the automatically-created draft; the sparse unique index
    // allows multiple IARs to have an unassigned RIS number.
    risNumber: undefined,
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
  });
  report.propertyCards = [propertyCard._id];
  report.requisition = ris._id;

  // A single consolidated ICS or PAR record is created per IAR, chosen by the
  // combined total cost of all items: below the PAR threshold goes to ICS,
  // at/above it goes to PAR.
  const combinedTotalCost = report.items.reduce((sum, entry) => sum + Number(entry.totalCost || 0), 0);
  const itemsForAccountability = report.items.map((entry) => ({
    quantity: entry.quantity ?? null,
    unit: entry.unit || null,
    unitCost: entry.unitCost ?? null,
    totalCost: entry.totalCost ?? null,
    description: entry.description || entry.item || null,
    propertyNumber: entry.stockPropertyNumber || entry.stockNumber || null,
    dateAcquired: report.purchaseDate || report.acceptanceDate || null,
  }));

  if (combinedTotalCost < 50000) {
    const ics = await InventoryCustodianSlip.create({
      iar: report._id,
      entityName: report.entityName || null,
      fundCluster: report.fundCluster || null,
      icsNumber: undefined,
      items: itemsForAccountability.map((entry) => ({
        quantity: entry.quantity,
        unit: entry.unit,
        unitCost: entry.unitCost,
        totalCost: entry.totalCost,
        description: entry.description,
        inventoryItemNo: entry.propertyNumber,
        estimatedUsefulLife: null,
      })),
      remarks: null,
      receivedFrom: { name: report.supplierName || null, position: null, date: report.acceptanceDate || null },
      receivedBy: { name: report.custodian || null, position: null, date: report.acceptanceDate || null },
    });
    report.inventoryCustodianSlip = ics._id;
  } else {
    const par = await PropertyAcknowledgementReceipt.create({
      iar: report._id,
      entityName: report.entityName || null,
      fundCluster: report.fundCluster || null,
      parNumber: undefined,
      items: itemsForAccountability.map((entry) => ({
        quantity: entry.quantity,
        unit: entry.unit,
        description: entry.description,
        propertyNumber: entry.propertyNumber,
        dateAcquired: entry.dateAcquired,
        amount: entry.totalCost,
      })),
      remarks: null,
      receivedBy: { name: report.custodian || null, position: null, date: report.acceptanceDate || null },
      issuedBy: { name: null, position: null, date: null },
    });
    report.propertyAcknowledgementReceipt = par._id;
  }

  report.status = 'LOGGED_TO_STOCKS';
  await report.save();

  await ActivityLog.create({
    user: req.user._id,
    action: 'IAR created',
    details: `IAR ${report.iarNumber} created; Property Card, RIS draft, and ${report.inventoryCustodianSlip ? 'ICS' : 'PAR'} record generated`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'IAR created', report, 201);
});

module.exports = router;
