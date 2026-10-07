const Setting = require('../models/Setting');
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
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

const { resolveAccount: resolvePersonUser, linkLegacyRequests, ownerFilter: ownRisFilterById } = require('../utils/accountLinks');
const ownRisFilter = user => ownRisFilterById(user._id);

const manualStockItems = items => {
  if (!Array.isArray(items)) throw new Error('Items must be a list');
  return items.map(entry => {
    const stockNumber = Object.hasOwn(entry, 'stockNumber') ? entry.stockNumber : entry.stock_number ?? null;
    if (stockNumber !== null && typeof stockNumber !== 'string') throw new Error('Stock Number must be text or empty');
    const { stock_number, ...item } = entry;
    return { ...item, stockNumber };
  });
};

const canReviewRis = (user) => (
  user?.role === 'admin'
);

router.get('/', authenticate, authorize(['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS']), async (req, res) => {
  await linkLegacyRequests();
  const query = { deleted: false };
  if (req.user.role !== 'admin') Object.assign(query, ownRisFilter(req.user));
  const ris = await listRecords(RequisitionIssueSlip, req, { baseFilter: query, searchFields: RIS_SEARCH_FIELDS });
  return successResponse(res, 'RIS retrieved', ris);
});

router.post('/my-requests', authenticate, async (req, res) => {
  if (req.user.role !== 'user' || !req.user.permissions?.includes('canViewRIS')) return errorResponse(res, 'Forbidden', [], 403);
  const { purpose, items } = req.body;
  if (!String(purpose || '').trim() || !Array.isArray(items) || !items.length) return errorResponse(res, 'Purpose and requested items are required', [], 400);
  let manualItems;
  try { manualItems = manualStockItems(items); } catch (error) { return errorResponse(res, error.message, [], 400); }
  const requestedItems = [];
  for (const entry of manualItems) {
    if (entry.stockNumber && requestedItems.some(item => item.stockNumber === entry.stockNumber)) return errorResponse(res, 'Select each stock item only once', [], 400);
    const quantity = Number(entry.quantityRequested);
    if (!Number.isInteger(quantity) || quantity <= 0) return errorResponse(res, 'Requested quantities must be positive whole numbers', [], 400);
    const item = entry.stockNumber ? await Item.findOne({ stockNumber: entry.stockNumber, deleted: false }) : null;
    const description = entry.description || item?.description || item?.name;
    if (!String(description || '').trim()) return errorResponse(res, 'Describe the requested item', [], 400);
    requestedItems.push({ stockNumber: entry.stockNumber, description, unit: entry.unit || item?.unit || '', quantityRequested: quantity, quantityIssued: 0 });
  }
  const person = { user: req.user._id, name: getUserLabel(req.user), designation: req.user.office, date: new Date() };
  const ris = await RequisitionIssueSlip.create({ risNumber: `RIS-${new Date().getFullYear()}-${crypto.randomUUID()}`, entityName: (await Setting.findOne().sort({ createdAt: 1 }).lean())?.entityName || 'LGU Carigara', division: req.user.division, office: req.user.office, purpose: String(purpose).trim(), requestedBy: person, receivedBy: person, items: requestedItems, status: 'PENDING_REVIEW' });
  await ActivityLog.create({ user: req.user._id, action: 'RIS created', details: `RIS ${ris.risNumber} submitted by user for admin review`, ipAddress: req.ip, browser: req.get('user-agent') });
  return successResponse(res, 'Request submitted for admin review', ris, 201);
});

router.get('/returnable-items', authenticate, authorize('canManageInventory'), async (req, res) => {
  if (!canReviewRis(req.user)) return errorResponse(res, 'Forbidden', [], 403);
  await linkLegacyRequests();
  const records = await RequisitionIssueSlip.find({ deleted: false, status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } }).lean();
  const ids = records.map(record => record._id);
  const [slips, supplies] = await Promise.all([
    PropertyReturnSlip.find({ deleted: false, 'items.ris': { $in: ids }, $or: [{ status: 'RETURNED' }, { status: { $exists: false } }], ...(mongoose.isValidObjectId(req.query.exclude) ? { _id: { $ne: req.query.exclude } } : {}) }).lean(),
    ReturnedSupply.find({ deleted: false, prs: null, ris: { $in: ids } }).lean(),
  ]);
  const returned = new Map();
  for (const row of [...slips.flatMap(slip => slip.items), ...supplies]) {
    const key = `${row.ris}:${row.risItem}`;
    returned.set(key, (returned.get(key) || 0) + Number(row.quantity || 0));
  }
  const output = [];
  for (const record of records) {
    const items = [];
    for (const item of record.items) {
      const quantityRemaining = Math.max(0, Number(item.quantityIssued || 0) - (returned.get(`${record._id}:${item._id}`) || 0));
      if (!quantityRemaining) continue;
      const stock = await Item.findOne({ deleted: false, stockNumber: item.stockNumber }).lean();
      const inventory = stock ? await Inventory.findOne({ deleted: false, item: stock._id }).sort({ createdAt: -1 }).lean() : null;
      items.push({ ...item, quantityRemaining, unitCost: item.unitCost ?? inventory?.unitCost ?? stock?.cost ?? 0, propertyNumber: inventory?.propertyNumber || item.stockNumber || '' });
    }
    if (items.length) output.push({ ...record, items });
  }
  return successResponse(res, 'Issued items available for return', output);
});

router.get('/request-items', authenticate, authorize('canViewRIS'), async (req, res) => {
  const items = await Item.find({ deleted: false }).select('stockNumber description name unit').sort({ stockNumber: 1 });
  return successResponse(res, 'Requestable items retrieved', items);
});

router.get(['/my-items', '/my-returns'], authenticate, (req, res, next) => req.path === '/my-items' ? next() : authorize('canViewRIS')(req, res, next), async (req, res) => {
  await linkLegacyRequests();
  const includeRequests = req.path === '/my-items';
  const records = await RequisitionIssueSlip.find({ deleted: false, ...ownRisFilter(req.user), ...(!includeRequests ? { status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } } : {}) }).sort({ createdAt: -1 });
  const slips = await PropertyReturnSlip.find({ deleted: false, 'items.ris': { $in: records.map(record => record._id) } }).sort({ createdAt: -1 });
  const directReturns = await ReturnedSupply.find({ deleted: false, prs: null, ris: { $in: records.map(record => record._id) } });
  const items = records.flatMap(ris => ris.items.filter(item => includeRequests || item.quantityIssued > 0).map(item => {
    const issued = ['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(ris.status);
    const returns = slips.flatMap(slip => slip.items.filter(entry => String(entry.ris) === String(ris._id) && String(entry.risItem) === String(item._id)).map(entry => ({ quantity: entry.quantity, prsNumber: slip.prsNumber, status: slip.status || 'RETURNED', rejectionReason: slip.rejectionReason, date: slip.returnedTo?.date || slip.createdAt, receivedBy: slip.returnedTo?.name, note: slip.note })));
    returns.push(...directReturns.filter(entry => String(entry.ris) === String(ris._id) && String(entry.risItem) === String(item._id)).map(entry => ({ quantity: entry.quantity, prsNumber: 'Returned Supply', status: 'RETURNED', date: entry.returnedTo?.date || entry.createdAt, receivedBy: entry.returnedTo?.name, note: entry.note })));
    const quantityReturned = returns.filter(entry => entry.status === 'RETURNED').reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const pendingReturn = returns.some(entry => entry.status === 'PENDING');
    const requestStatuses = { DRAFT: 'Recorded request', PENDING_REVIEW: 'Pending admin review', PENDING_APPROVAL: 'Pending approval', REVIEWED: 'Reviewed — awaiting issuance', APPROVED: 'Approved — awaiting issuance', REJECTED: 'Request rejected' };
    return { risId: ris._id, itemId: item._id, risNumber: ris.risNumber, requestStatus: ris.status, recordedAt: ris.createdAt, quantityRequested: item.quantityRequested, issued, formType: item.formType, documentNumber: item.documentNumber, formId: item.issuanceForm, unitCost: item.unitCost, description: item.description, stockNumber: item.stockNumber, quantityIssued: issued ? item.quantityIssued : 0, issuedAt: issued ? ris.issuedAt : null, quantityReturned, pendingReturn, quantityRemaining: issued ? Math.max(0, item.quantityIssued - quantityReturned) : 0, status: !issued ? requestStatuses[ris.status] || 'Recorded request' : pendingReturn ? 'Awaiting admin confirmation' : quantityReturned >= item.quantityIssued && item.quantityIssued > 0 ? 'Successfully returned' : quantityReturned > 0 ? 'Partially returned' : item.quantityIssued > 0 ? 'Not returned' : 'Not issued', returns };
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
  const directReturned = (await ReturnedSupply.find({ deleted: false, prs: null, ris: ris._id, risItem: item._id })).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  if (quantity > item.quantityIssued - returned - directReturned) return errorResponse(res, 'Return quantity exceeds the remaining issued quantity', [], 400);
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
  const settings = await Setting.findOne().sort({ createdAt: 1 }).lean();
  if (settings?.entityName) payload.entityName = settings.entityName;
  try {
    if (payload.items) payload.items = manualStockItems(payload.items);
    payload.requestedBy = await resolvePersonUser(payload.requestedBy);
    payload.receivedBy = await resolvePersonUser(payload.receivedBy);
    if (payload.requestedBy?.name && !payload.requestedBy.user) return errorResponse(res, 'Requested by does not match a user account. Select the Linked user account under Requested by so the RIS appears in that account.', [], 400);
  } catch (error) { return errorResponse(res, error.message, [], 400); }
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
  const existing = await RequisitionIssueSlip.findOne({ _id: req.params.id, deleted: false });
  if (!existing) return errorResponse(res, 'RIS not found', [], 404);
  if (['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(existing.status)) return errorResponse(res, 'Issued RIS records are locked to preserve their linked stock and accountability. Use the return workflow for issued items.', [], 409);
  const updates = { ...req.body };
  for (const key of ['inventoryCustodianSlip', 'propertyAcknowledgementReceipt', 'issuedAt', 'signatureHash']) delete updates[key];
  if (['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(updates.status)) return errorResponse(res, 'Use the issuance action to issue a RIS', [], 400);
  try {
    if (updates.items) updates.items = manualStockItems(updates.items);
    if (updates.requestedBy) updates.requestedBy = await resolvePersonUser(updates.requestedBy);
    if (updates.receivedBy) updates.receivedBy = await resolvePersonUser(updates.receivedBy);
    if (updates.requestedBy?.name && !updates.requestedBy.user) return errorResponse(res, 'Requested by does not match a user account. Select the Linked user account under Requested by.', [], 400);
  } catch (error) { return errorResponse(res, error.message, [], 400); }
  if (updates.items) updates.items = updates.items.map((entry) => ({ ...entry, totalCost: entry.totalCost ?? null }));
  const ris = await RequisitionIssueSlip.findOneAndUpdate({ _id: req.params.id, deleted: false, status: { $nin: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } }, updates, { new: true, runValidators: true });
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

  let reviewedItems;
  try { reviewedItems = req.body.items ? manualStockItems(req.body.items) : ris.items.map(item => item.toObject()); } catch (error) { return errorResponse(res, error.message, [], 400); }
  ris.items = reviewedItems.map((entry) => {
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
  try {
    const result = await require('../utils/issueRis')(req.params.id, req.user, { ip: req.ip, browser: req.get('user-agent') }, { approve: true });
    return successResponse(res, 'RIS approved and issued; items are available for return to admin', result.ris);
  } catch (error) {
    return errorResponse(res, error.message || 'Unable to approve and issue RIS', [], 400);
  }
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
  if (!canReviewRis(req.user)) return errorResponse(res, 'Forbidden', [], 403);
  try {
    const result = await require('../utils/issueRis')(req.params.id, req.user, { ip: req.ip, browser: req.get('user-agent') });
    return successResponse(res, 'RIS issued; ICS/PAR linked to the requester account', result);
  } catch (error) {
    return errorResponse(res, error.message || 'Unable to issue RIS', [], 400);
  }
});
module.exports = router;
