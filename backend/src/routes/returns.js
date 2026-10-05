const express = require('express');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
const ActivityLog = require('../models/ActivityLog');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const { listRecords } = require('../utils/paginate');
const router = express.Router();

const PRS_SEARCH_FIELDS = [
  'lguName', 'purpose', 'note',
  'returnedBy.name', 'returnedBy.designation',
  'returnedTo.name', 'returnedTo.designation',
];

const logReturnedSupply = (report) => ReturnedSupply.insertMany(report.items.map(entry => ({ prs: report._id, lguName: report.lguName, purpose: report.purpose, quantity: entry.quantity, unit: entry.unit, description: entry.description, propertyNumber: entry.propertyNumber, mrNumber: entry.mrNumber, unitValue: entry.unitValue, totalValue: entry.totalValue, note: report.note, returnedBy: report.returnedBy, returnedTo: report.returnedTo })));

// Explicit item references prevent returns from being assigned by description or name.
const validateLinks = async (items, excludeId) => {
  const totals = new Map();
  for (const entry of items || []) {
    if (!entry.ris && !entry.risItem) continue;
    const ris = await RequisitionIssueSlip.findOne({ _id: entry.ris, deleted: false, status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } });
    const item = ris?.items.id(entry.risItem);
    if (!item || !(item.quantityIssued > 0)) throw new Error('Select a valid issued RIS item');
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Returned quantity must be greater than zero');
    const key = `${entry.ris}:${entry.risItem}`;
    totals.set(key, (totals.get(key) || 0) + quantity);
    const previous = await PropertyReturnSlip.find({ deleted: false, $or: [{ status: 'RETURNED' }, { status: { $exists: false } }], ...(excludeId ? { _id: { $ne: excludeId } } : {}), 'items.ris': entry.ris });
    const returned = previous.reduce((sum, slip) => sum + slip.items.filter(row => String(row.ris) === String(entry.ris) && String(row.risItem) === String(entry.risItem)).reduce((count, row) => count + Number(row.quantity || 0), 0), 0);
    if (returned + totals.get(key) > item.quantityIssued) throw new Error(`Returned quantity exceeds issued quantity for ${item.description || item.stockNumber}`);
  }
};

router.get('/', authenticate, authorize(['canViewDashboard', 'canManageInventory']), async (req, res) => {
  const reports = await listRecords(PropertyReturnSlip, req, { baseFilter: { deleted: false }, searchFields: PRS_SEARCH_FIELDS });
  return successResponse(res, 'PRS retrieved', reports);
});

router.post('/', authenticate, authorize('canManageInventory'), async (req, res) => {
  const payload = { ...req.body };
  payload.status = 'RETURNED';
  delete payload.pendingKey;
  delete payload.submittedBy;
  try { await validateLinks(payload.items); } catch (error) { return errorResponse(res, error.message, [], 400); }
  payload.items = (payload.items || []).map((entry) => ({
    ...entry,
    totalValue: Number(entry.quantity || 0) * Number(entry.unitValue || 0),
  }));

  const report = await PropertyReturnSlip.create(payload);

  await ReturnedSupply.insertMany(report.items.map((entry) => ({
    prs: report._id,
    lguName: report.lguName,
    purpose: report.purpose,
    quantity: entry.quantity,
    unit: entry.unit,
    description: entry.description,
    propertyNumber: entry.propertyNumber,
    mrNumber: entry.mrNumber,
    unitValue: entry.unitValue,
    totalValue: entry.totalValue,
    note: report.note,
    returnedBy: report.returnedBy,
    returnedTo: report.returnedTo,
  })));

  await ActivityLog.create({
    user: req.user._id,
    action: 'PRS created',
    details: `PRS created for ${report.lguName || 'LGU'}; ${report.items.length} item(s) logged to Returned Supply`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PRS created', report, 201);
});

router.post('/:id/confirm', authenticate, authorize('canManageInventory'), async (req, res) => {
  const pending = await PropertyReturnSlip.findOne({ _id: req.params.id, deleted: false, status: 'PENDING' });
  if (!pending) return errorResponse(res, 'Pending return slip not found', [], 404);
  try { await validateLinks(pending.items, pending._id); } catch (error) { return errorResponse(res, error.message, [], 400); }
  const name = [req.user.firstName, req.user.middleName, req.user.lastName].filter(Boolean).join(' ') || req.user.username;
  const report = await PropertyReturnSlip.findOneAndUpdate({ _id: pending._id, status: 'PENDING' }, { $set: { status: 'RETURNED', returnedTo: { name, designation: req.user.office, date: new Date() } }, $unset: { pendingKey: 1 } }, { returnDocument: 'after' });
  if (!report) return errorResponse(res, 'Return already processed', [], 409);
  await logReturnedSupply(report);
  await ActivityLog.create({ user: req.user._id, action: 'Return confirmed', details: `Return ${report.prsNumber} confirmed and logged to Returned Supply`, ipAddress: req.ip, browser: req.get('user-agent') });
  return successResponse(res, 'Return confirmed', report);
});

router.post('/:id/reject', authenticate, authorize('canManageInventory'), async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return errorResponse(res, 'A reason is required', [], 400);
  const report = await PropertyReturnSlip.findOneAndUpdate({ _id: req.params.id, deleted: false, status: 'PENDING' }, { $set: { status: 'REJECTED', rejectionReason: reason }, $unset: { pendingKey: 1 } }, { returnDocument: 'after' });
  if (!report) return errorResponse(res, 'Pending return slip not found', [], 404);
  await ActivityLog.create({ user: req.user._id, action: 'Return rejected', details: `Return ${report.prsNumber} rejected: ${reason}`, ipAddress: req.ip, browser: req.get('user-agent') });
  return successResponse(res, 'Return rejected', report);
});

router.put('/:id', authenticate, authorize('canManageInventory'), async (req, res) => {
  const payload = { ...req.body };
  const existing = await PropertyReturnSlip.findOne({ _id: req.params.id, deleted: false });
  if (!existing) return errorResponse(res, 'PRS not found', [], 404);
  if (existing.submittedBy) return errorResponse(res, 'Use Confirm return or Reject for a user-submitted return slip', [], 400);
  delete payload.status;
  delete payload.pendingKey;
  delete payload.submittedBy;
  try { await validateLinks(payload.items, req.params.id); } catch (error) { return errorResponse(res, error.message, [], 400); }
  if (payload.items) {
    payload.items = payload.items.map((entry) => ({
      ...entry,
      totalValue: Number(entry.quantity || 0) * Number(entry.unitValue || 0),
    }));
  }
  const report = await PropertyReturnSlip.findOneAndUpdate(
    { _id: req.params.id, deleted: false },
    payload,
    { new: true, runValidators: true },
  );
  if (!report) return errorResponse(res, 'PRS not found', [], 404);

  await ActivityLog.create({
    user: req.user._id,
    action: 'PRS updated',
    details: `PRS ${report._id} updated`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PRS updated', report);
});

module.exports = router;
