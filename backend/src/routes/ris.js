const { accountRecords } = require('../utils/accountRecords');
const { validateAdminForm } = require('../middlewares/validateAdminForm');
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
const Accountability = require('../models/PropertyAccountability');
const { notifyAdmins, notifyUsers } = require('../utils/workflowNotifications');
const { queueWorkflowEmail } = require('../utils/workflowEmails');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const { listRecords } = require('../utils/paginate');
const { reserveDocumentNumber } = require('../utils/documentNumber');
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
    return { ...item, inventory: item.inventory || undefined, stockNumber };
  });
};

const canReviewRis = (user) => (
  user?.role === 'admin'
);

router.get('/issued-form/:id', authenticate, require('../middlewares/auth').adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 'Invalid RIS record', [], 400);
  const record = await RequisitionIssueSlip.findOne({ _id: req.params.id, deleted: false });
  if (!record) return errorResponse(res, 'RIS form not found', [], 404);
  return successResponse(res, 'RIS form retrieved', record);
});

router.get('/issued-users', authenticate, require('../middlewares/auth').adminOnly, async (req, res) => {
  const users = await User.find({ deleted: false, role: 'user' }).select('firstName middleName lastName username office').sort({ firstName: 1 }).lean();
  return successResponse(res, 'User folders retrieved', users);
});

router.get('/issued-items', authenticate, require('../middlewares/auth').adminOnly, async (req, res) => {
  return successResponse(res, 'Current issued item holders retrieved', await require('../utils/issuedItems')());
});

router.get('/', authenticate, authorize(['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS']), async (req, res) => {
  await linkLegacyRequests();
  const query = { deleted: false };
  if (req.user.role !== 'admin') Object.assign(query, ownRisFilter(req.user));
  const ris = await listRecords(RequisitionIssueSlip, req, { baseFilter: query, searchFields: RIS_SEARCH_FIELDS });
  const records = Array.isArray(ris) ? ris : ris.items;
  const stocks = await Item.find({ stockNumber: { $in: records.flatMap(record => record.items.map(row => row.stockNumber).filter(Boolean)) } }).select('stockNumber name category').lean();
  const names = new Map(stocks.map(stock => [stock.stockNumber, stock.name || (stock.category !== 'General' ? stock.category : '')]));
  const reports = records.map(record => ({ ...record.toObject(), itemNames: [...new Map(record.items.map(row => row.itemName || names.get(row.stockNumber) || row.description || '').filter(Boolean).map(name => [name.toLowerCase(), name])).values()] }));
  return successResponse(res, 'RIS retrieved', Array.isArray(ris) ? reports : { ...ris, items: reports });
});

router.post('/my-requests', authenticate, async (req, res) => {
  if (req.user.role !== 'user' || !req.user.permissions?.includes('canViewRIS')) return errorResponse(res, 'Forbidden', [], 403);
  const { purpose, items } = req.body;
  if (!Array.isArray(items) || !items.length) return errorResponse(res, 'Requested items are required', [], 400);
  let manualItems;
  try { manualItems = manualStockItems(items); } catch (error) { return errorResponse(res, error.message, [], 400); }
  const requestedItems = [];
  for (const entry of manualItems) {
    if (entry.stockNumber && requestedItems.some(item => item.stockNumber === entry.stockNumber && (!entry.inventory || String(item.inventory) === String(entry.inventory)))) return errorResponse(res, 'Select each stock item only once', [], 400);
    const quantity = Number(entry.quantityRequested);
    if (!Number.isInteger(quantity) || quantity <= 0) return errorResponse(res, 'Requested quantities must be positive whole numbers', [], 400);
    const item = entry.stockNumber ? await Item.findOne({ stockNumber: entry.stockNumber, deleted: false }) : null;
    const description = entry.description || item?.description || item?.name;
    if (!String(description || '').trim()) return errorResponse(res, 'Describe the requested item', [], 400);
    if (entry.inventory && !mongoose.isValidObjectId(entry.inventory)) return errorResponse(res, 'Select a valid asset unit', [], 400);
    requestedItems.push({ inventory: entry.inventory || undefined, stockNumber: entry.stockNumber, description, unit: entry.unit || item?.unit || '', quantityRequested: quantity, quantityIssued: null });
  }
  let fundCluster, responsibilityCenterCode;
  try { ({ fundCluster, responsibilityCenterCode } = await require('../utils/resolveRisItemFunds')(requestedItems)); }
  catch (error) { return errorResponse(res, error.message, [], 400); }
  const person = { user: req.user._id, name: getUserLabel(req.user), designation: req.user.office, date: new Date() };
  const risNumber = await reserveDocumentNumber(RequisitionIssueSlip, 'risNumber');
  const ris = await RequisitionIssueSlip.create({ risNumber, fundCluster, responsibilityCenterCode, entityName: require('../config/entityName'), division: req.user.division, office: req.user.office, purpose: String(purpose || '').trim(), requestedBy: person, receivedBy: person, items: requestedItems, status: 'PENDING_REVIEW' });
  await notifyAdmins('New supply/property request', `${getUserLabel(req.user)} submitted ${ris.risNumber}.`, '/ris');
  await queueWorkflowEmail('REQUESTED', ris);
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
  const items = await Item.find({ deleted: false, quantityOnHand: { $gt: 0 } }).select('stockNumber description name category unit itemType quantityOnHand cost').sort({ name: 1, stockNumber: 1 });
  const units = await Inventory.find({ deleted: false, item: { $in: items.map(item => item._id) }, $or: [{ serialNumber: { $type: 'string', $nin: ['', null] } }, { property: { $ne: null } }] }).select('item property propertyNumber serialNumber unitCost inspectionAcceptanceReport status').lean();
  const receiptIds = units.map(unit => unit.inspectionAcceptanceReport).filter(Boolean);
  const receipts = await require('../models/InspectionAcceptanceReport').find({ deleted: false, $or: [{ _id: { $in: receiptIds } }, { 'items.stockNumber': { $in: items.map(item => item.stockNumber) } }, { 'items.stockPropertyNumber': { $in: items.map(item => item.stockNumber) } }] }).select('fundCluster responsibilityCenterCode items.stockNumber items.stockPropertyNumber').sort({ createdAt: -1, _id: -1 }).lean();
  const receiptFunds = new Map(receipts.map(receipt => [String(receipt._id), receipt.fundCluster || '']));
  units.forEach(unit => { unit.fundCluster = receiptFunds.get(String(unit.inspectionAcceptanceReport)) || ''; unit.responsibilityCenterCode = receipts.find(receipt => String(receipt._id) === String(unit.inspectionAcceptanceReport))?.responsibilityCenterCode || ''; });
  const cards = await require('../models/PropertyCard').find({ deleted: false, 'items.inventory': { $in: units.map(unit => unit._id) } }).lean();
  const balances = new Map();
  for (const card of cards) for (const row of require('../utils/propertyCardHistory').propertyCardHistory(card).items) balances.set(String(row.inventory), row.balanceQuantity);
  const held = await require('../models/PropertyAccountability').find({ deleted: false, active: true, inventory: { $in: units.map(unit => unit._id) }, $expr: { $gt: ['$quantity', { $ifNull: ['$returnedQuantity', 0] }] } }).select('inventory').lean();
  const heldIds = new Set(held.map(row => String(row.inventory)));
  const storageStatuses = ['LOGGED_TO_STOCKS', 'IN_STORAGE', 'IN_STORAGE_AVAILABLE', 'RETURNED'];
  const available = units.filter(unit => storageStatuses.includes(unit.status) && !heldIds.has(String(unit._id)) && (!balances.has(String(unit._id)) || balances.get(String(unit._id)) > 0));
  const choices = items.map(item => ({ ...item.toObject(), fundCluster: receipts.find(receipt => receipt.items.some(row => (row.stockNumber || row.stockPropertyNumber) === item.stockNumber))?.fundCluster || '', responsibilityCenterCode: receipts.find(receipt => receipt.items.some(row => (row.stockNumber || row.stockPropertyNumber) === item.stockNumber))?.responsibilityCenterCode || '', hasTrackedUnits: units.some(unit => String(unit.item) === String(item._id)), units: available.filter(unit => String(unit.item) === String(item._id)) }));
  return successResponse(res, 'Requestable items retrieved', choices.filter(item => !item.hasTrackedUnits || item.units.length));
});

router.get(['/my-items', '/my-returns'], authenticate, (req, res, next) => req.path === '/my-items' ? next() : authorize('canViewRIS')(req, res, next), async (req, res) => {
  await linkLegacyRequests();
  const includeRequests = req.path === '/my-items';
  const items = await accountRecords(req.user, includeRequests);
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
    const report = await mongoose.connection.transaction(async session => {
      const asset = await Accountability.findOne({ ris: ris._id, risItem: item._id, deleted: false }).session(session);
      if (asset && (!asset.active || String(asset.user) !== String(req.user._id))) throw new Error('This property is no longer under your accountability');
      if (asset?.pendingMovement) throw Object.assign(new Error('This property already has a pending movement'), { code: 11000 });
      const prsNumber = await reserveDocumentNumber(PropertyReturnSlip, 'prsNumber', new Date(), session);
      const [created] = await PropertyReturnSlip.create([{ prsNumber, lguName: ris.entityName || 'LGU Carigara', purpose: 'Returned To Stock', submittedBy: req.user._id, status: 'PENDING', pendingKey: `${ris._id}:${item._id}`, items: [{ ris: ris._id, risItem: item._id, quantity, unit: item.unit, description: item.description, propertyNumber: inventory?.propertyNumber || '', mrNumber: ris.risNumber, unitValue, totalValue: quantity * unitValue }], returnedBy: { user: req.user._id, name: getUserLabel(req.user), designation: req.user.office, date: new Date() } }], { session });
      if (asset) {
        created.items[0].accountability = asset._id;
        asset.pendingMovement = `PRS:${created._id}`;
        await asset.save({ session }); await created.save({ session });
      }
      await notifyAdmins('Return awaiting receipt', `${getUserLabel(req.user)} submitted ${created.prsNumber}.`, '/returns', session);
      return created;
    });
    await ActivityLog.create({ user: req.user._id, action: 'Return submitted', details: `Return ${report.prsNumber} submitted for admin confirmation`, ipAddress: req.ip, browser: req.get('user-agent') });
    return successResponse(res, 'Return slip sent to admin', report, 201);
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 'This item already has a return awaiting admin confirmation', [], 409);
    return errorResponse(res, error.message, [], 400);
  }
});

const inheritItemFund = async (req, res, next) => {
  if (req.user?.role !== 'admin' || !Array.isArray(req.body.items) || !req.body.items.length) return next();
  try { const resolved = await require('../utils/resolveRisItemFunds')(req.body.items, req.body.fundCluster); req.body.fundCluster = resolved.fundCluster; if (resolved.responsibilityCenterCode) req.body.responsibilityCenterCode = resolved.responsibilityCenterCode; req.body.items = resolved.items; }
  catch (error) { return errorResponse(res, error.message, [], 400); }
  return next();
};

router.post('/', authenticate, inheritItemFund, validateAdminForm('ris'), authorize(['canCreateRIS', 'canManageRIS']), [
  body('entityName').notEmpty().withMessage('Entity name is required'),
  body('fundCluster').notEmpty().withMessage('Fund cluster is required'),
  body('office').notEmpty().withMessage('Office is required'),
  body('responsibilityCenterCode').notEmpty().withMessage('Responsibility center code is required'),
  body('requestedBy').notEmpty().withMessage('Requested by is required'),
  body('receivedBy').notEmpty().withMessage('Received by is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const payload = { ...req.body };
  delete payload.manualIssueKey;
  delete payload.sourceInventory;
  delete payload.lastEditedAt;
  payload.entityName = require('../config/entityName');
  try {
    if (payload.items) payload.items = manualStockItems(payload.items);
    payload.requestedBy = await resolvePersonUser(payload.requestedBy);
    payload.receivedBy = await resolvePersonUser(payload.receivedBy);
    if (payload.requestedBy?.name && !payload.requestedBy.user && !payload.requestedBy.offlineRecipient) return errorResponse(res, 'Select a user account or save an offline recipient under Requested by.', [], 400);
  } catch (error) { return errorResponse(res, error.message, [], 400); }
  if (payload.autoNumber === true || !String(payload.risNumber || '').trim()) payload.risNumber = await reserveDocumentNumber(RequisitionIssueSlip, 'risNumber');
  delete payload.autoNumber;
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

  await queueWorkflowEmail('REQUESTED', ris);
  return successResponse(res, 'RIS created', ris, 201);
});

router.put('/:id', authenticate, inheritItemFund, validateAdminForm('ris'), authorize(['canCreateRIS', 'canManageRIS']), async (req, res) => {
  const existing = await RequisitionIssueSlip.findOne({ _id: req.params.id, deleted: false });
  if (!existing) return errorResponse(res, 'RIS not found', [], 404);
  if (['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(existing.status)) return errorResponse(res, 'Issued RIS records are locked to preserve their linked stock and accountability. Use the return workflow for issued items.', [], 409);
  const updates = { ...req.body, lastEditedAt: new Date() };
  for (const key of ['inventoryCustodianSlip', 'propertyAcknowledgementReceipt', 'issuedAt', 'signatureHash', 'manualIssueKey', 'sourceInventory']) delete updates[key];
  if (['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(updates.status)) return errorResponse(res, 'Use the issuance action to issue a RIS', [], 400);
  try {
    if (updates.items) updates.items = manualStockItems(updates.items);
    if (updates.requestedBy) updates.requestedBy = await resolvePersonUser(updates.requestedBy);
    if (updates.receivedBy) updates.receivedBy = await resolvePersonUser(updates.receivedBy);
    if (updates.requestedBy?.name && !updates.requestedBy.user && !updates.requestedBy.offlineRecipient) return errorResponse(res, 'Select a user account or save an offline recipient under Requested by.', [], 400);
  } catch (error) { return errorResponse(res, error.message, [], 400); }
  if (!String(existing.risNumber || '').trim() && !String(updates.risNumber || '').trim()) updates.risNumber = await reserveDocumentNumber(RequisitionIssueSlip, 'risNumber');
  delete updates.autoNumber;
  if (updates.items) updates.items = updates.items.map((entry) => ({ ...entry, totalCost: entry.totalCost ?? null }));
  const ris = await RequisitionIssueSlip.findOneAndUpdate({ _id: req.params.id, deleted: false, status: { $nin: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } }, updates, { new: true, runValidators: true });
  if (!ris) return errorResponse(res, 'RIS not found', [], 404);
  await queueWorkflowEmail('REQUESTED', ris);
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
  for (const entry of reviewedItems) {
    const requested = Number(entry.quantityRequested);
    const issued = entry.quantityIssued == null ? Math.min(requested, Number(stockMap.get(entry.stockNumber)?.quantityOnHand || 0)) : Number(entry.quantityIssued);
    if (!Number.isInteger(requested) || requested <= 0 || !Number.isInteger(issued) || issued < 0 || issued > requested || issued > Number(stockMap.get(entry.stockNumber)?.quantityOnHand || 0)) {
      return errorResponse(res, 'Issued quantities must be whole numbers within the requested quantity and available stock', [], 400);
    }
  }
  ris.items = reviewedItems.map((entry) => {
    const requested = Number(entry.quantityRequested || 0);
    const inventoryItem = stockMap.get(entry.stockNumber);
    const available = Number(inventoryItem?.quantityOnHand || 0);
    const issued = entry.quantityIssued == null ? Math.min(requested, available) : Number(entry.quantityIssued);
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
  await queueWorkflowEmail('REQUESTED', ris);

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

  const reason = String(req.body.rejectionReason).trim();
  if (!reason) return errorResponse(res, 'Rejection reason is required', [], 400);
  const rejecter = getUserLabel(req.user);
  const ris = await RequisitionIssueSlip.findOneAndUpdate({ _id: req.params.id, deleted: false, status: { $in: ['PENDING_REVIEW', 'PENDING_APPROVAL', 'REVIEWED', 'APPROVED'] } }, { $set: { status: 'REJECTED', rejectionReason: reason, rejectedBy: rejecter, rejectedAt: new Date(), signatureHash: createSignatureHash({ risId: req.params.id, action: 'REJECTED', userId: String(req.user._id), reason, at: Date.now() }) } }, { returnDocument: 'after' });
  if (!ris) return errorResponse(res, 'RIS is no longer awaiting approval', [], 409);
  await notifyUsers([ris.requestedBy?.user || ris.receivedBy?.user], 'Request rejected', `${ris.risNumber}: ${reason}`, '/ris');

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
