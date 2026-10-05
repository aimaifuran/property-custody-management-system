const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const LedgerTransaction = require('../models/LedgerTransaction');
const PropertyAccountability = require('../models/PropertyAccountability');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const { listRecords } = require('../utils/paginate');
const router = express.Router();

const RIS_SEARCH_FIELDS = [
  'risNumber',
  'entityName', 'fundCluster', 'division', 'office', 'responsibilityCenterCode', 'purpose',
  'status', 'rejectionReason', 'rejectedBy', 'reviewedBy',
  'requestedBy.name', 'requestedBy.designation',
  'approvedBy.name', 'approvedBy.designation',
  'issuedBy.name', 'issuedBy.designation',
  'receivedBy.name', 'receivedBy.designation',
];

const getUserLabel = (user) => {
  const name = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.username || user.email || 'System User';
};

const createSignatureHash = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const userLabel = (user) => [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ').trim();

const resolvePersonUser = async (person) => {
  if (!person || person.user) return person;
  const name = String(person.name || '').trim();
  if (!name) return person;
  const user = await User.findOne({
    deleted: false,
    $or: [
      { username: name },
      { email: name.toLowerCase() },
      { firstName: name.split(/\s+/)[0], lastName: name.split(/\s+/).slice(-1)[0] },
    ],
  }).select('_id');
  return user ? { ...person, user: user._id } : person;
};

const ownRisFilter = (user) => ({
  $or: [
    { 'requestedBy.user': user._id },
    { 'receivedBy.user': user._id },
    { 'requestedBy.user': null, 'requestedBy.name': { $in: [userLabel(user), user.username, user.email].filter(Boolean) } },
    { 'receivedBy.user': null, 'receivedBy.name': { $in: [userLabel(user), user.username, user.email].filter(Boolean) } },
  ],
});

const canReviewRis = (user) => (
  user?.role === 'admin'
);

const getDocumentNumber = async (formType, createdAt, cache) => {
  const year = createdAt.getFullYear();
  const cacheKey = `${formType}:${year}`;

  if (cache[cacheKey] == null) {
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    cache[cacheKey] = await PropertyAccountability.countDocuments({
      formType,
      createdAt: { $gte: start, $lt: end },
    });
  }

  cache[cacheKey] += 1;
  return `${formType}-${year}-MM-${String(cache[cacheKey]).padStart(4, '0')}`;
};

router.get('/', authenticate, authorize(['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS']), async (req, res) => {
  const query = { deleted: false };
  if (req.user.role !== 'admin') Object.assign(query, ownRisFilter(req.user));
  const ris = await listRecords(RequisitionIssueSlip, req, { baseFilter: query, searchFields: RIS_SEARCH_FIELDS });
  return successResponse(res, 'RIS retrieved', ris);
});

router.post('/my-requests', authenticate, async (req, res) => {
  if (req.user.role !== 'user' || !req.user.permissions?.includes('canViewRIS')) return errorResponse(res, 'Forbidden', [], 403);
  const { purpose, items } = req.body;
  if (!String(purpose || '').trim() || !Array.isArray(items) || !items.length) return errorResponse(res, 'Purpose and requested items are required', [], 400);
  const requestedItems = [];
  for (const entry of items) {
    if (requestedItems.some(item => item.stockNumber === entry.stockNumber)) return errorResponse(res, 'Select each stock item only once', [], 400);
    const quantity = Number(entry.quantityRequested);
    if (!Number.isInteger(quantity) || quantity <= 0) return errorResponse(res, 'Requested quantities must be positive whole numbers', [], 400);
    const item = await Item.findOne({ stockNumber: entry.stockNumber, deleted: false });
    if (!item) return errorResponse(res, 'Select a valid stock number', [], 400);
    requestedItems.push({ stockNumber: item.stockNumber, description: item.description || item.name, unit: item.unit, quantityRequested: quantity, quantityIssued: 0 });
  }
  const person = { user: req.user._id, name: getUserLabel(req.user), designation: req.user.office, date: new Date() };
  const ris = await RequisitionIssueSlip.create({ risNumber: `RIS-${new Date().getFullYear()}-${crypto.randomUUID()}`, entityName: 'LGU Carigara', division: req.user.division, office: req.user.office, purpose: String(purpose).trim(), requestedBy: person, receivedBy: person, items: requestedItems, status: 'PENDING_REVIEW' });
  await ActivityLog.create({ user: req.user._id, action: 'RIS created', details: `RIS ${ris.risNumber} submitted by user for admin review`, ipAddress: req.ip, browser: req.get('user-agent') });
  return successResponse(res, 'Request submitted for admin review', ris, 201);
});

router.get('/request-items', authenticate, authorize('canViewRIS'), async (req, res) => {
  const items = await Item.find({ deleted: false }).select('stockNumber description name unit').sort({ stockNumber: 1 });
  return successResponse(res, 'Requestable items retrieved', items);
});

router.get('/my-returns', authenticate, authorize('canViewRIS'), async (req, res) => {
  const records = await RequisitionIssueSlip.find({ deleted: false, ...ownRisFilter(req.user), status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } });
  const slips = await PropertyReturnSlip.find({ deleted: false, 'items.ris': { $in: records.map(record => record._id) } }).sort({ createdAt: -1 });
  const items = records.flatMap(ris => ris.items.filter(item => item.quantityIssued > 0).map(item => {
    const returns = slips.flatMap(slip => slip.items.filter(entry => String(entry.ris) === String(ris._id) && String(entry.risItem) === String(item._id)).map(entry => ({ quantity: entry.quantity, prsNumber: slip.prsNumber, status: slip.status || 'RETURNED', rejectionReason: slip.rejectionReason, date: slip.returnedTo?.date || slip.createdAt, receivedBy: slip.returnedTo?.name, note: slip.note })));
    const quantityReturned = returns.filter(entry => entry.status === 'RETURNED').reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const pendingReturn = returns.some(entry => entry.status === 'PENDING');
    return { risId: ris._id, itemId: item._id, risNumber: ris.risNumber, description: item.description, stockNumber: item.stockNumber, quantityIssued: item.quantityIssued, issuedAt: ris.issuedAt, quantityReturned, pendingReturn, quantityRemaining: Math.max(0, item.quantityIssued - quantityReturned), status: pendingReturn ? 'Awaiting admin confirmation' : quantityReturned >= item.quantityIssued ? 'Successfully returned' : quantityReturned > 0 ? 'Partially returned' : 'Not returned', returns };
  }));
  return successResponse(res, 'Your item return status retrieved', items);
});

router.post('/my-returns', authenticate, async (req, res) => {
  if (req.user.role !== 'user' || !req.user.permissions?.includes('canViewRIS')) return errorResponse(res, 'Forbidden', [], 403);
  if (!mongoose.isValidObjectId(req.body.risId) || !mongoose.isValidObjectId(req.body.itemId)) return errorResponse(res, 'Select an issued item', [], 400);
  const ris = await RequisitionIssueSlip.findOne({ _id: req.body.risId, deleted: false, ...ownRisFilter(req.user), status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } });
  const item = ris?.items.id(req.body.itemId);
  if (!item || !(item.quantityIssued > 0)) return errorResponse(res, 'Issued item not found under your account', [], 404);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) return errorResponse(res, 'Return quantity must be a positive whole number', [], 400);
  const slips = await PropertyReturnSlip.find({ deleted: false, 'items.ris': ris._id });
  const returned = slips.filter(slip => !slip.status || slip.status === 'RETURNED').reduce((sum, slip) => sum + slip.items.filter(entry => String(entry.ris) === String(ris._id) && String(entry.risItem) === String(item._id)).reduce((count, entry) => count + Number(entry.quantity || 0), 0), 0);
  if (quantity > item.quantityIssued - returned) return errorResponse(res, 'Return quantity exceeds the remaining issued quantity', [], 400);
  const stock = await Item.findOne({ stockNumber: item.stockNumber, deleted: false });
  const inventory = stock ? await Inventory.findOne({ item: stock._id, deleted: false }).sort({ createdAt: -1 }) : null;
  const unitValue = Number(inventory?.unitCost ?? stock?.cost ?? 0);
  try {
    const report = await PropertyReturnSlip.create({ prsNumber: `PRS-${new Date().getFullYear()}-${crypto.randomUUID()}`, lguName: ris.entityName || 'LGU Carigara', purpose: 'Returned To Stock', submittedBy: req.user._id, status: 'PENDING', pendingKey: `${ris._id}:${item._id}`, items: [{ ris: ris._id, risItem: item._id, quantity, unit: item.unit, description: item.description, propertyNumber: inventory?.propertyNumber || '', mrNumber: ris.risNumber, unitValue, totalValue: quantity * unitValue }], returnedBy: { name: getUserLabel(req.user), designation: req.user.office, date: new Date() } });
    await ActivityLog.create({ user: req.user._id, action: 'Return submitted', details: `Return ${report.prsNumber} submitted for admin confirmation`, ipAddress: req.ip, browser: req.get('user-agent') });
    return successResponse(res, 'Return slip sent to admin', report, 201);
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 'This item already has a return awaiting admin confirmation', [], 409);
    throw error;
  }
});

router.post('/', authenticate, authorize(['canCreateRIS', 'canManageRIS']), [
  body('risNumber').notEmpty().withMessage('RIS number is required'),
  body('entityName').notEmpty().withMessage('Entity name is required'),
  body('fundCluster').notEmpty().withMessage('Fund cluster is required'),
  body('division').notEmpty().withMessage('Division is required'),
  body('office').notEmpty().withMessage('Office is required'),
  body('responsibilityCenterCode').notEmpty().withMessage('Responsibility center code is required'),
  body('requestedBy').notEmpty().withMessage('Requested by is required'),
  body('receivedBy').notEmpty().withMessage('Received by is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const payload = { ...req.body };
  payload.requestedBy = await resolvePersonUser(payload.requestedBy);
  payload.receivedBy = await resolvePersonUser(payload.receivedBy);
  const ris = await RequisitionIssueSlip.create({
    ...payload,
    status: 'PENDING_REVIEW',
  });

  await ActivityLog.create({
    user: req.user._id,
    action: 'RIS created',
    details: `RIS ${ris.risNumber} created with pending approval status`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'RIS created', ris, 201);
});

router.put('/:id', authenticate, authorize(['canCreateRIS', 'canManageRIS']), async (req, res) => {
  const updates = { ...req.body };
  updates.requestedBy = await resolvePersonUser(updates.requestedBy);
  updates.receivedBy = await resolvePersonUser(updates.receivedBy);
  if (updates.items) updates.items = updates.items.map((entry) => ({ ...entry, totalCost: entry.totalCost ?? null }));
  const ris = await RequisitionIssueSlip.findOneAndUpdate({ _id: req.params.id, deleted: false }, updates, { new: true, runValidators: true });
  if (!ris) return errorResponse(res, 'RIS not found', [], 404);
  return successResponse(res, 'RIS updated', ris);
});

router.post('/:id/review', authenticate, async (req, res) => {
  if (!canReviewRis(req.user)) return errorResponse(res, 'Forbidden', [], 403);
  const ris = await RequisitionIssueSlip.findById(req.params.id);
  if (!ris || ris.deleted) return errorResponse(res, 'RIS not found', [], 404);
  if (!['PENDING_REVIEW', 'PENDING_APPROVAL', 'REVIEWED'].includes(ris.status)) {
    return errorResponse(res, 'RIS cannot be reviewed in its current state', [], 400);
  }

  const stockLookup = await Item.find({ deleted: false });
  const stockMap = new Map(stockLookup.map((entry) => [entry.stockNumber, entry]));

  ris.items = (req.body.items || ris.items).map((entry) => {
    const requested = Number(entry.quantityRequested || 0);
    const inventoryItem = stockMap.get(entry.stockNumber);
    const available = Number(inventoryItem?.quantityOnHand || 0);
    const issued = Math.min(requested, available);
    const systemRemarks = available <= 0
      ? 'Out of Stock - For Procurement'
      : issued < requested
        ? `[System: Deficit of ${requested - issued} units - Split workflow initiated]`
        : 'Fully Issued';

    return {
      ...entry,
      stockAvailable: available,
      isAvailable: available > 0,
      quantityIssued: issued,
      remarks: entry.remarks || systemRemarks,
    };
  });

  ris.status = 'REVIEWED';
  ris.reviewedBy = getUserLabel(req.user);
  ris.reviewedAt = new Date();
  await ris.save();

  await ActivityLog.create({
    user: req.user._id,
    action: 'RIS reviewed',
    details: `RIS ${ris.risNumber} reviewed by supply officer`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'RIS reviewed', ris);
});

router.post('/:id/approve', authenticate, async (req, res) => {
  if (!canReviewRis(req.user)) return errorResponse(res, 'Forbidden', [], 403);
  const ris = await RequisitionIssueSlip.findById(req.params.id);
  if (!ris || ris.deleted) return errorResponse(res, 'RIS not found', [], 404);
  if (!['REVIEWED', 'PENDING_APPROVAL'].includes(ris.status)) return errorResponse(res, 'RIS is not ready for approval', [], 400);

  const approver = getUserLabel(req.user);
  const approvedAt = new Date();
  ris.status = 'APPROVED';
  ris.approvedBy = { name: approver, designation: req.user.office || '', date: approvedAt };
  ris.approvedAt = approvedAt;
  ris.signatureHash = createSignatureHash({ risId: ris._id.toString(), action: 'APPROVED', userId: req.user._id.toString(), at: Date.now() });
  await ris.save();

  await ActivityLog.create({
    user: req.user._id,
    action: 'RIS approved',
    details: `RIS ${ris.risNumber} approved by ${approver}`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'RIS approved', ris);
});

router.post('/:id/reject', authenticate, [
  body('rejectionReason').notEmpty().withMessage('Rejection reason is required'),
], async (req, res) => {
  if (!canReviewRis(req.user)) return errorResponse(res, 'Forbidden', [], 403);
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const ris = await RequisitionIssueSlip.findById(req.params.id);
  if (!ris || ris.deleted) return errorResponse(res, 'RIS not found', [], 404);
  if (ris.status !== 'PENDING_APPROVAL') return errorResponse(res, 'RIS is not pending approval', [], 400);

  const rejecter = getUserLabel(req.user);
  ris.status = 'REJECTED';
  ris.rejectionReason = req.body.rejectionReason;
  ris.rejectedBy = rejecter;
  ris.rejectedAt = new Date();
  ris.signatureHash = createSignatureHash({ risId: ris._id.toString(), action: 'REJECTED', userId: req.user._id.toString(), reason: req.body.rejectionReason, at: Date.now() });
  await ris.save();

  await ActivityLog.create({
    user: req.user._id,
    action: 'RIS rejected',
    details: `RIS ${ris.risNumber} rejected by ${rejecter}: ${req.body.rejectionReason}`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'RIS rejected', ris);
});

router.post('/:id/issue', authenticate, async (req, res) => {
  try {
  if (!canReviewRis(req.user)) {
    return errorResponse(res, 'Forbidden', [], 403);
  }
  const ris = await RequisitionIssueSlip.findById(req.params.id);
  if (!ris || ris.deleted) {
    return errorResponse(res, 'RIS not found', [], 404);
  }
    if (!['APPROVED', 'REVIEWED'].includes(ris.status)) {
      return errorResponse(res, 'RIS must be approved before issuance', [], 400);
    }

    const issuedAt = new Date();
    const issuedBy = getUserLabel(req.user);
    const docCounters = {};
    const createdAccountabilities = [];

    for (const entry of ris.items) {
      const quantityRequested = Number(entry.quantityRequested || 0);
      const quantityIssued = Number(entry.quantityIssued ?? quantityRequested);
      if (quantityIssued < 0) {
        return errorResponse(res, `Invalid quantity for ${entry.stockNumber || entry.description || 'item'}`, [], 400);
      }
      if (quantityIssued === 0) {
        continue;
      }
      entry.quantityIssued = quantityIssued;

      const item = await Item.findOne({ stockNumber: entry.stockNumber, deleted: false });
      if (!item) {
        return errorResponse(res, `Stock number "${entry.stockNumber}" was not found in Property Card inventory. Please select a valid stock number.`, [], 404);
      }
      if (quantityIssued > item.quantityOnHand) {
        return errorResponse(
          res,
          `Insufficient stock available to fulfill this request. Available: ${item.quantityOnHand}, Requested: ${quantityIssued}.`,
          [],
          400,
        );
      }

      const inventory = await Inventory.findOne({ item: item._id, deleted: false }).sort({ createdAt: -1 });
      if (!inventory) {
        return errorResponse(res, `Inventory record not found for ${entry.stockNumber}`, [], 404);
      }

      item.quantityOnHand -= quantityIssued;
      item.status = item.quantityOnHand > 0 ? 'IN_STORAGE' : 'ISSUED';
      await item.save();

      const unitCost = Number(inventory.unitCost || item.cost || 0);
      const formType = unitCost < 50000 ? 'ICS' : 'PAR';
      const documentNumber = await getDocumentNumber(formType, issuedAt, docCounters);

      const accountability = await PropertyAccountability.create({
        inventory: inventory._id,
        employee: ris.receivedBy?.name || ris.requestedBy?.name || 'Unassigned',
        office: ris.office,
        serialNumber: inventory.serialNumber || entry.stockNumber,
        propertyNumber: inventory.propertyNumber || '',
        issueDate: issuedAt,
        condition: 'Serviceable',
        remarks: entry.remarks || ris.purpose || entry.description,
        formType,
        documentNumber,
        signatureHash: createSignatureHash({
          risId: ris._id.toString(),
          inventoryId: inventory._id.toString(),
          documentNumber,
          userId: req.user._id.toString(),
          issuedAt: issuedAt.toISOString(),
        }),
        active: true,
      });

      inventory.accountability = accountability._id;
      inventory.status = 'ACTIVE_IN_USE';
      await inventory.save();

      await LedgerTransaction.create({
        inventory: inventory._id,
        type: 'outgoing',
        quantity: quantityIssued,
        reference: ris.risNumber,
        description: `RIS issuance - ${formType} ${documentNumber}`,
        runningBalance: item.quantityOnHand,
      });

      createdAccountabilities.push({
        formType,
        documentNumber,
        stockNumber: entry.stockNumber,
        quantityIssued,
      });
    }

    ris.status = 'ACCOUNTABILITY_LOCKED';
    ris.issuedAt = issuedAt;
    ris.issuedBy = { name: issuedBy, designation: req.user.office || '', date: issuedAt };
    ris.signatureHash = createSignatureHash({
      risId: ris._id.toString(),
      action: 'ISSUED',
      userId: req.user._id.toString(),
      at: issuedAt.toISOString(),
    });
    await ris.save();

    await ActivityLog.create({
      user: req.user._id,
      action: 'RIS issued',
      details: `RIS ${ris.risNumber} issued; ${createdAccountabilities.length} accountability record(s) created`,
      ipAddress: req.ip,
      browser: req.get('user-agent'),
    });

    return successResponse(res, 'RIS issued and accountability locked', {
      ris,
      accountabilities: createdAccountabilities,
    });
  } catch (error) {
    return errorResponse(res, error.message || 'Unable to issue RIS', [], 400);
  }
});

module.exports = router;
