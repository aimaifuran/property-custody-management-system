const express = require('express');
const Supplier = require('../models/Supplier');
const Inventory = require('../models/Inventory');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const PropertyCard = require('../models/PropertyCard');
const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const PropertyTransferReport = require('../models/PropertyTransferReport');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { successResponse } = require('../utils/response');
const { authenticate, authorize, adminOnly } = require('../middlewares/auth');
const router = express.Router();
router.use(authenticate, adminOnly);

router.get('/inventory', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const inventories = await Inventory.find({ deleted: false }).populate('item').populate('supplier');
  return successResponse(res, 'Inventory report', inventories);
});

router.get('/suppliers', authenticate, authorize('canViewSuppliers'), async (req, res) => {
  const suppliers = await Supplier.find({ deleted: false });
  return successResponse(res, 'Supplier report', suppliers);
});

router.get('/issued', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const getValue = (document, path) => path.split('.').reduce((value, key) => value?.[key], document);
  const reportSources = [
    { model: InspectionAcceptanceReport, type: 'IAR', title: 'Inspection & Acceptance Report', numberField: 'iarNumber', dateFields: ['date', 'createdAt'] },
    { model: PropertyCard, type: 'PROPERTY CARD', title: 'Property Card', numberField: 'propertyNumber', dateFields: ['createdAt'] },
    { model: RequisitionIssueSlip, type: 'RIS', title: 'Requisition Issue Slip', numberField: 'risNumber', dateFields: ['issuedAt', 'date', 'createdAt'] },
    { model: InventoryCustodianSlip, type: 'ICS', title: 'Inventory Custodian Slip', numberField: 'icsNumber', dateFields: ['createdAt'] },
    { model: PropertyAcknowledgementReceipt, type: 'PAR', title: 'Property Acknowledgement Receipt', numberField: 'parNumber', dateFields: ['createdAt'] },
    { model: PropertyTransferReport, type: 'PTR', title: 'Property Transfer Report', numberField: 'ptrNumber', dateFields: ['date', 'createdAt'] },
    { model: PropertyReturnSlip, type: 'PRS', title: 'Property Return Slip', numberField: 'prsNumber', dateFields: ['date', 'returnedBy.date', 'returnedTo.date', 'createdAt'] },
    { model: ReturnedSupply, type: 'RETURNED SUPPLY', numberField: 'mrNumber', dateFields: ['date', 'returnedBy.date', 'returnedTo.date', 'createdAt'] },
  ];

  const records = await Promise.all(reportSources.map(async (source) => {
    const documents = await source.model.find({ deleted: false }).lean();
    return documents.map((document) => {
      const reportDate = source.dateFields.map((field) => getValue(document, field)).find(Boolean) || document.createdAt;
      return {
        id: document._id,
        type: source.type,
        title: source.title,
        documentNumber: document[source.numberField] || 'Unnumbered',
        entityName: document.entityName || document.office || '',
        reportDate,
        status: document.status || 'RECORDED',
      };
    });
  }));

  return successResponse(res, 'Issued reports retrieved', records.flat().sort((left, right) => new Date(right.reportDate) - new Date(left.reportDate)));
});

router.get('/archive', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const year = Number(req.query.year);
  const search = String(req.query.search || '').trim().toLowerCase();
  const type = String(req.query.type || 'ALL');
  const condition = String(req.query.condition || 'ALL');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'A valid archive year is required' });
  }

  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const getValue = (document, path) => path.split('.').reduce((value, key) => value?.[key], document);
  const sources = [
    { model: InspectionAcceptanceReport, type: 'IAR', title: 'Inspection & Acceptance Report', numberField: 'iarNumber', dateFields: ['date', 'createdAt'], searchFields: ['iarNumber', 'entityName', 'office', 'inspectedBy.name', 'items'] },
    { model: PropertyCard, type: 'PROPERTY CARD', title: 'Property Card', numberField: 'propertyNumber', dateFields: ['createdAt'], searchFields: ['propertyNumber', 'entityName', 'description', 'serialNumber', 'items'] },
    { model: RequisitionIssueSlip, type: 'RIS', title: 'Requisition', numberField: 'risNumber', dateFields: ['issuedAt', 'date', 'createdAt'], searchFields: ['risNumber', 'entityName', 'office', 'requestedBy.name', 'receivedBy.name', 'items'] },
    { model: InventoryCustodianSlip, type: 'ICS', title: 'Inventory Custodian', numberField: 'icsNumber', dateFields: ['createdAt'], searchFields: ['icsNumber', 'entityName', 'office', 'receivedBy.name', 'items'] },
    { model: PropertyAcknowledgementReceipt, type: 'PAR', title: 'Property Acknowledgement Receipts', numberField: 'parNumber', dateFields: ['createdAt'], searchFields: ['parNumber', 'entityName', 'office', 'receivedBy.name', 'items'] },
    { model: PropertyTransferReport, type: 'PTR', title: 'Property Transfer Report', numberField: 'ptrNumber', dateFields: ['date', 'createdAt'], searchFields: ['ptrNumber', 'entityName', 'fromAccountablePerson.name', 'toAccountablePerson.name', 'items'] },
    { model: PropertyReturnSlip, type: 'PRS', title: 'Property Return Slip', numberField: 'prsNumber', dateFields: ['date', 'returnedBy.date', 'returnedTo.date', 'createdAt'], searchFields: ['prsNumber', 'lguName', 'returnedBy.name', 'returnedTo.name', 'items'] },
    { model: ReturnedSupply, type: 'RETURNED SUPPLY', title: 'Returned Supply', numberField: 'mrNumber', dateFields: ['date', 'returnedBy.date', 'returnedTo.date', 'createdAt'], searchFields: ['mrNumber', 'lguName', 'description', 'propertyNumber', 'returnedBy.name', 'returnedTo.name'] },
  ];

  const matchesSearch = (document, fields) => !search || fields.some((field) => JSON.stringify(getValue(document, field) ?? '').toLowerCase().includes(search));
  const matchesCondition = (document) => {
    if (condition === 'ALL') return true;
    const value = JSON.stringify(document).toLowerCase();
    if (condition === 'UNSERVICEABLE') return value.includes('unserviceable');
    if (condition === 'MISSING') return value.includes('missing') || value.includes('lost');
    return value.includes('serviceable') && !value.includes('unserviceable');
  };

  const records = await Promise.all(sources.filter((source) => type === 'ALL' || source.type === type).map(async (source) => {
    const documents = await source.model.find({ deleted: false }).lean();
    return documents.filter((document) => {
      const reportDate = source.dateFields.map((field) => getValue(document, field)).find(Boolean) || document.createdAt;
      return new Date(reportDate) >= start && new Date(reportDate) < end && matchesSearch(document, source.searchFields) && matchesCondition(document);
    }).map((document) => {
      const reportDate = source.dateFields.map((field) => getValue(document, field)).find(Boolean) || document.createdAt;
      return {
        id: document._id,
        type: source.type,
        title: source.title,
        documentNumber: document[source.numberField] || 'Unnumbered',
        entityName: document.entityName || document.office || document.lguName || '',
        employee: document.receivedBy?.name || document.requestedBy?.name || document.returnedBy?.name || document.returnedTo?.name || '',
        reportDate,
        status: document.status || 'RECORDED',
        details: document,
      };
    });
  }));

  return successResponse(res, 'Historical records retrieved', records.flat().sort((left, right) => new Date(right.reportDate) - new Date(left.reportDate)));
});

router.get('/annual-summary', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'A valid report year is required' });
  }

  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const dateRange = { $gte: start, $lt: end };

  const [acquired, inventoryStatus, issued, returned] = await Promise.all([
    Inventory.aggregate([
      { $match: { deleted: false, purchaseDate: dateRange } },
      { $group: { _id: null, quantity: { $sum: '$quantity' }, cost: { $sum: '$assetCost' } } },
    ]),
    Inventory.aggregate([
      { $match: { deleted: false } },
      { $group: { _id: '$status', quantity: { $sum: '$quantity' }, count: { $sum: 1 } } },
      { $sort: { quantity: -1 } },
    ]),
    RequisitionIssueSlip.aggregate([
      { $match: { deleted: false, $or: [{ issuedAt: dateRange }, { date: dateRange }] } },
      { $group: { _id: null, quantity: { $sum: '$totalQuantity' }, count: { $sum: 1 } } },
    ]),
    ReturnedSupply.aggregate([
      { $match: { deleted: false, $or: [{ 'returnedBy.date': dateRange }, { 'returnedTo.date': dateRange }, { createdAt: dateRange }] } },
      { $group: { _id: null, quantity: { $sum: '$quantity' }, count: { $sum: 1 } } },
    ]),
  ]);

  const statusRows = Object.fromEntries(inventoryStatus.map((entry) => [entry._id || 'UNKNOWN', entry]));
  const availableStatuses = ['LOGGED_TO_STOCKS', 'IN_STORAGE', 'IN_STORAGE_AVAILABLE'];
  const unserviceableStatuses = ['RETURNED_UNSERVICEABLE', 'IN_STORAGE_UNSERVICEABLE', 'UNSERVICEABLE'];
  const damagedOrMissingStatuses = ['DAMAGED', 'MISSING', 'LOST'];
  const sumStatusQuantity = (statuses) => statuses.reduce((total, status) => total + (statusRows[status]?.quantity || 0), 0);

  return successResponse(res, 'Annual supply summary retrieved', {
    year,
    acquired: { quantity: acquired[0]?.quantity || 0, cost: acquired[0]?.cost || 0 },
    issued: { quantity: issued[0]?.quantity || 0, count: issued[0]?.count || 0 },
    returned: { quantity: returned[0]?.quantity || 0, count: returned[0]?.count || 0 },
    available: { quantity: sumStatusQuantity(availableStatuses) },
    unserviceable: { quantity: sumStatusQuantity(unserviceableStatuses) },
    damagedOrMissing: { quantity: sumStatusQuantity(damagedOrMissingStatuses) },
    inventoryStatus,
  });
});

router.get('/ris', authenticate, authorize('canViewRIS'), async (req, res) => {
  const ris = await RequisitionIssueSlip.find({ deleted: false });
  return successResponse(res, 'RIS report', ris);
});

router.get('/iar', authenticate, authorize('canViewIAR'), async (req, res) => {
  const iar = await InspectionAcceptanceReport.find({ deleted: false });
  return successResponse(res, 'IAR report', iar);
});

router.get('/summary', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const [
    suppliers,
    iar,
    ris,
    inventory,
    propertyCards,
    ics,
    par,
    ptr,
    prs,
    returnedSupply,
  ] = await Promise.all([
    Supplier.countDocuments({ deleted: false }),
    InspectionAcceptanceReport.countDocuments({ deleted: false }),
    RequisitionIssueSlip.countDocuments({ deleted: false }),
    Inventory.countDocuments({ deleted: false }),
    PropertyCard.countDocuments({ deleted: false }),
    InventoryCustodianSlip.countDocuments({ deleted: false }),
    PropertyAcknowledgementReceipt.countDocuments({ deleted: false }),
    PropertyTransferReport.countDocuments({ deleted: false }),
    PropertyReturnSlip.countDocuments({ deleted: false }),
    ReturnedSupply.countDocuments({ deleted: false }),
  ]);

  const statusBreakdown = await Inventory.aggregate([
    { $match: { deleted: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const canViewUsers = req.user.role === 'admin' || req.user.permissions?.includes('canManageUsers');
  const users = canViewUsers ? await User.countDocuments({ deleted: false }) : null;
  const [returnSlipBreakdown, returnedSupplyBreakdown, userBreakdown] = await Promise.all([
    PropertyReturnSlip.aggregate([
      { $match: { deleted: false } },
      { $group: { _id: { $ifNull: ['$purpose', 'Unspecified'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ReturnedSupply.aggregate([
      { $match: { deleted: false } },
      { $group: { _id: { $ifNull: ['$purpose', 'Unspecified'] }, count: { $sum: '$quantity' } } },
      { $sort: { count: -1 } },
    ]),
    canViewUsers ? User.aggregate([{ $match: { deleted: false } }, { $group: { _id: '$role', count: { $sum: 1 } } }]) : [],
  ]);

  const recentActivity = await ActivityLog.find({})
    .populate('user', 'firstName lastName username')
    .sort({ createdAt: -1 })
    .limit(10);

  return successResponse(res, 'Dashboard summary', {
    counts: { suppliers, iar, ris, inventory, propertyCards, ics, par, ptr, prs, returnedSupply, users },
    inventoryStatus: statusBreakdown.map((entry) => ({ status: entry._id, count: entry.count })),
    returnSlipBreakdown: returnSlipBreakdown.map((entry) => ({ label: entry._id, count: entry.count })),
    returnedSupplyBreakdown: returnedSupplyBreakdown.map((entry) => ({ label: entry._id, count: entry.count })),
    userBreakdown: userBreakdown.map((entry) => ({ label: entry._id, count: entry.count })),
    recentActivity,
  });
});

module.exports = router;
