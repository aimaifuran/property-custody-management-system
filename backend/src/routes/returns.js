const express = require('express');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const { listRecords } = require('../utils/paginate');
const router = express.Router();
const mongoose = require('mongoose');
const Accountability = require('../models/PropertyAccountability');
const postPropertyReturn = require('../utils/postPropertyReturn');
const { notifyUsers } = require('../utils/workflowNotifications');
const { reserveDocumentNumber } = require('../utils/documentNumber');

const PRS_SEARCH_FIELDS = [
  'lguName', 'purpose', 'note',
  'returnedBy.name', 'returnedBy.designation',
  'returnedTo.name', 'returnedTo.designation',
];

const logReturnedSupply = (report) => ReturnedSupply.insertMany(report.items.map(entry => ({ prs: report._id, lguName: report.lguName, purpose: report.purpose, quantity: entry.quantity, unit: entry.unit, description: entry.description, propertyNumber: entry.propertyNumber, mrNumber: entry.mrNumber, unitValue: entry.unitValue, totalValue: entry.totalValue, note: report.note, returnedBy: report.returnedBy, returnedTo: report.returnedTo })));

const { linkReturnItems, validateLinks } = require('../utils/returnLinks');

// Only the printed receiving signatory is editable; the acting user remains
// recorded in the activity log and cannot change the return's custodian.
const returnedToSignatory = (values, fallback = {}) => {
  if (values === undefined) values = {};
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Returned To must contain a name, designation and date');
  const signatory = {};
  for (const field of ['name', 'designation']) {
    const value = Object.hasOwn(values, field) ? values[field] : fallback[field];
    if (value != null && typeof value !== 'string') throw new Error(`Returned To ${field} must be text`);
    signatory[field] = String(value ?? '').trim();
  }
  const date = Object.hasOwn(values, 'date') ? values.date : fallback.date;
  if (date == null || date === '') signatory.date = null;
  else {
    if (!(date instanceof Date) && typeof date !== 'string') throw new Error('Returned To date must be valid');
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) throw new Error('Returned To date must be valid');
    signatory.date = parsed;
  }
  return signatory;
};

router.get('/', authenticate, authorize(['canViewRIS', 'canViewDashboard', 'canManageInventory']), async (req, res) => {
  const reports = await listRecords(PropertyReturnSlip, req, { baseFilter: { deleted: false, ...(req.user.role === 'admin' ? {} : { $or: [{ submittedBy: req.user._id }, { 'returnedBy.user': req.user._id }] }) }, searchFields: PRS_SEARCH_FIELDS });
  return successResponse(res, 'PRS retrieved', reports);
});

router.post('/', authenticate, authorize('canManageInventory'), async (req, res) => {
  const payload = { ...req.body };
  delete payload.lastEditedAt;
  const automaticNumber = payload.autoNumber === true || !String(payload.prsNumber || '').trim();
  delete payload.autoNumber;
  payload.status = 'RETURNED';
  delete payload.pendingKey;
  delete payload.submittedBy;
  try { await linkReturnItems(payload); await validateLinks(payload.items); } catch (error) { return errorResponse(res, error.message, [], 400); }
  payload.items = (payload.items || []).map((entry) => ({
    ...entry,
    totalValue: Number(entry.quantity || 0) * Number(entry.unitValue || 0),
  }));

  delete payload.stockPosted;
  let report;
  try {
    report = await mongoose.connection.transaction(async session => {
      await validateLinks(payload.items, null, session);
      if (automaticNumber) payload.prsNumber = await reserveDocumentNumber(PropertyReturnSlip, 'prsNumber', new Date(), session);
      const [created] = await PropertyReturnSlip.create([payload], { session });
      await postPropertyReturn(created, session);
      return created;
    });
  } catch (error) { return errorResponse(res, error.message, [], 400); }

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
  const name = [req.user.firstName, req.user.middleName, req.user.lastName].filter(Boolean).join(' ') || req.user.username;
  let report;
  try {
    report = await mongoose.connection.transaction(async session => {
      const pending = await PropertyReturnSlip.findOne({ _id: req.params.id, deleted: false, status: 'PENDING' }).session(session);
      if (!pending) throw Object.assign(new Error('Pending return slip not found'), { status: 404 });
      await validateLinks(pending.items, pending._id, session);
      const conditions = req.body.conditions || {};
      for (const entry of pending.items) {
        const condition = conditions[String(entry._id)] || req.body.condition || 'Serviceable';
        if (!['Serviceable', 'Unserviceable'].includes(condition)) throw new Error('Select Serviceable or Unserviceable');
        entry.condition = condition;
      }
      pending.status = 'RETURNED'; pending.pendingKey = undefined;
      pending.returnedTo = returnedToSignatory(req.body.returnedTo, {
        name: pending.returnedTo?.name || name,
        designation: pending.returnedTo?.designation || req.user.office,
        date: pending.returnedTo?.date || new Date(),
      });
      await postPropertyReturn(pending, session);
      await notifyUsers([pending.submittedBy || pending.returnedBy?.user], 'Return received', `${pending.prsNumber || 'PRS'} received and accountability updated.`, '/my-returns', session);
      return pending;
    });
  } catch (error) { return errorResponse(res, error.message, [], error.status || 400); }
  await ActivityLog.create({ user: req.user._id, action: 'Return confirmed', details: `Return ${report.prsNumber} confirmed and logged to Returned Supply`, ipAddress: req.ip, browser: req.get('user-agent') });
  return successResponse(res, 'Return confirmed', report);
});

router.post('/:id/reject', authenticate, authorize('canManageInventory'), async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return errorResponse(res, 'A reason is required', [], 400);
  const report = await mongoose.connection.transaction(async session => {
    const rejected = await PropertyReturnSlip.findOneAndUpdate({ _id: req.params.id, deleted: false, status: 'PENDING' }, { $set: { status: 'REJECTED', rejectionReason: reason }, $unset: { pendingKey: 1 } }, { returnDocument: 'after', session });
    if (rejected) {
      await Accountability.updateMany({ pendingMovement: `PRS:${rejected._id}` }, { $unset: { pendingMovement: 1 } }, { session });
      await notifyUsers([rejected.submittedBy || rejected.returnedBy?.user], 'Return rejected', `${rejected.prsNumber || 'PRS'}: ${reason}`, '/my-returns', session);
    }
    return rejected;
  });
  if (!report) return errorResponse(res, 'Pending return slip not found', [], 404);
  await ActivityLog.create({ user: req.user._id, action: 'Return rejected', details: `Return ${report.prsNumber} rejected: ${reason}`, ipAddress: req.ip, browser: req.get('user-agent') });
  return successResponse(res, 'Return rejected', report);
});

router.put('/:id', authenticate, authorize('canManageInventory'), async (req, res) => {
  const payload = { ...req.body, lastEditedAt: new Date() };
  const existing = await PropertyReturnSlip.findOne({ _id: req.params.id, deleted: false });
  if (!existing) return errorResponse(res, 'PRS not found', [], 404);
  if (existing.submittedBy && !(existing.status === 'RETURNED' && existing.stockPosted)) return errorResponse(res, 'Use Confirm return or Reject for a user-submitted return slip', [], 400);
  if (existing.stockPosted) {
    const movement = rows => rows.map(row => [String(row.ris || ''), String(row.risItem || ''), Number(row.quantity), row.condition || 'Serviceable']);
    if (payload.items && JSON.stringify(movement(payload.items)) !== JSON.stringify(movement(existing.items))) return errorResponse(res, 'Received quantities and conditions are locked because stock and accountability have already been updated', [], 409);
    if (payload.returnedBy?.user && String(payload.returnedBy.user) !== String(existing.returnedBy?.user || '')) return errorResponse(res, 'The custodian of a received return cannot be changed', [], 409);
    // Corrections to document details never repost stock or accountability.
    let report;
    try {
      const corrections = { note: payload.note ?? existing.note, lguName: payload.lguName ?? existing.lguName, lastEditedAt: payload.lastEditedAt };
      if (Object.hasOwn(payload, 'returnedTo')) corrections.returnedTo = returnedToSignatory(payload.returnedTo, existing.returnedTo);
      report = await mongoose.connection.transaction(async session => {
        const updated = await PropertyReturnSlip.findByIdAndUpdate(existing._id, { $set: corrections }, { returnDocument: 'after', runValidators: true, session });
        await ReturnedSupply.updateMany({ prs: updated._id }, { $set: { note: updated.note, lguName: updated.lguName, returnedTo: updated.returnedTo } }, { session });
        return updated;
      });
    } catch (error) { return errorResponse(res, error.message, [], 400); }
    await ActivityLog.create({ user: req.user._id, action: 'PRS updated', details: `PRS ${report._id} document details corrected`, ipAddress: req.ip, browser: req.get('user-agent') });
    return successResponse(res, 'PRS details updated', report);
  }
  delete payload.status;
  delete payload.stockPosted;
  delete payload.pendingKey;
  delete payload.submittedBy;
  try { await linkReturnItems(payload); await validateLinks(payload.items, req.params.id); } catch (error) { return errorResponse(res, error.message, [], 400); }
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

  await ReturnedSupply.deleteMany({ prs: report._id });
  await logReturnedSupply(report);

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
