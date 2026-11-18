const { validateAdminForm } = require('../middlewares/validateAdminForm');
const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/PpeStationReport');
const Setting = require('../models/Setting');
const { authenticate, adminOnly } = require('../middlewares/auth');
const { successResponse, errorResponse } = require('../utils/response');
const { SAVED_REPORT_SORT } = require('../utils/savedReportOrder');
const router = express.Router();
const signatoryFields = ['preparedBy', 'preparedDesignation', 'reviewedBy', 'reviewedDesignation'];
const defaults = { preparedBy: 'RALPH M. SAVERET JR.', preparedDesignation: 'Property Personnel', reviewedBy: 'ATTY. LEO L. PRUEL', reviewedDesignation: 'Head Property Unit' };
const fields = ['condition', 'accountGroup', 'governmentUnit', 'date', 'rows', ...signatoryFields];
const normalizeGroup = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const rowIdentity = row => {
  const propertyNumber = normalizeGroup(row.propertyNumber);
  return propertyNumber ? `property:${propertyNumber}` : `item:${[row.article, row.description, row.accountablePerson, row.remarks].map(normalizeGroup).join('|')}`;
};
const consolidateSavedGroups = async () => {
  const reports = await Report.find().sort({ createdAt: 1, _id: 1 });
  const groups = new Map();
  for (const report of reports) {
    const key = `${normalizeGroup(report.condition || 'Serviceable')}|${normalizeGroup(report.accountGroup)}`;
    const group = groups.get(key) || [];
    group.push(report);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const rowsByIdentity = new Map();
    for (const report of group) for (const row of report.rows) rowsByIdentity.set(rowIdentity(row), row.toObject ? row.toObject() : row);
    const keeper = group[0];
    const latest = group[group.length - 1];
    const duplicateIds = group.slice(1).map(report => report._id);
    await Report.findByIdAndUpdate(keeper._id, { $set: {
      condition: latest.condition || 'Serviceable', accountGroup: latest.accountGroup,
      governmentUnit: latest.governmentUnit, date: latest.date,
      preparedBy: latest.preparedBy, preparedDesignation: latest.preparedDesignation,
      reviewedBy: latest.reviewedBy, reviewedDesignation: latest.reviewedDesignation,
      rows: [...rowsByIdentity.values()], lastEditedAt: new Date(),
    } }, { runValidators: true });
    await Report.updateMany({ _id: { $in: duplicateIds } }, { $set: { deleted: true, lastEditedAt: new Date() } });
  }
};
router.use(authenticate, adminOnly);
router.get('/item-groups', async (req, res) => {
  const [inventories, accounts, issuedGroups, returnedSlips] = await Promise.all([
    require('../models/Inventory').find({ deleted: false }).populate('item').populate('property', 'condition').populate({ path: 'inspectionAcceptanceReport', select: 'items' }).sort({ createdAt: 1, _id: 1 }).lean(),
    require('../models/PropertyAccountability').find({ deleted: false, active: true }).populate('user', 'firstName middleName lastName username').populate('offlineRecipient', 'name').lean(),
    require('../utils/issuedItems')(),
    require('../models/PropertyReturnSlip').find({ deleted: false, status: 'RETURNED' })
      .populate({ path: 'items.accountability', populate: [{ path: 'inventory', populate: { path: 'item' } }, { path: 'user', select: 'firstName middleName lastName username' }, { path: 'offlineRecipient', select: 'name' }] }).lean(),
  ]);
  return successResponse(res, 'PPE item groups retrieved', require('../utils/stationPpeGroups')(inventories, accounts, issuedGroups, returnedSlips));
});
router.get('/', async (req, res) => {
  await consolidateSavedGroups();
  const [records, settings] = await Promise.all([Report.find().sort(SAVED_REPORT_SORT).lean(), Setting.findOne().sort({ createdAt: 1 }).lean()]);
  return successResponse(res, 'PPE station reports retrieved', { records, defaults: { ...defaults, ...settings?.ppeReportSignatories } });
});
const saveDefaults = async body => {
  const updates = Object.fromEntries(signatoryFields.filter(key => Object.hasOwn(body, key)).map(key => [`ppeReportSignatories.${key}`, body[key]]));
  if (Object.keys(updates).length) await Setting.findOneAndUpdate({}, { $set: updates }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, sort: { createdAt: 1 } });
};
router.patch('/signatories', async (req, res) => {
  if (signatoryFields.some(key => Object.hasOwn(req.body, key) && (typeof req.body[key] !== 'string' || req.body[key].length > 200))) return errorResponse(res, 'Signatories must be text of up to 200 characters', [], 400);
  await saveDefaults(req.body);
  return successResponse(res, 'Signatories remembered');
});
const save = async (req, res) => {
  if (req.params.id && !mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 'Invalid report ID', [], 400);
  const payload = Object.fromEntries(fields.filter(key => Object.hasOwn(req.body, key)).map(key => [key, req.body[key]]));
  if (Array.isArray(payload.rows)) payload.rows = payload.rows.map(row => ({ ...row, unitCost: row.unitCost === '' ? null : row.unitCost, totalCost: row.totalCost === '' ? null : row.totalCost }));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date || '') || Number.isNaN(Date.parse(payload.date)) || new Date(payload.date).toISOString().slice(0, 10) !== payload.date) return errorResponse(res, 'Enter a valid report date', [], 400);
  try {
    let report;
    let status = 200;
    if (req.params.id) {
      report = await Report.findByIdAndUpdate(req.params.id, { $set: { ...payload, lastEditedAt: new Date() } }, { new: true, runValidators: true });
    } else {
      const condition = payload.condition || 'Serviceable';
      const escapedGroup = normalizeGroup(payload.accountGroup).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const matching = await Report.find({ condition, accountGroup: new RegExp(`^\\s*${escapedGroup}\\s*$`, 'i') }).sort({ createdAt: 1, _id: 1 });
      const rowsByIdentity = new Map();
      for (const previous of matching) for (const row of previous.rows) rowsByIdentity.set(rowIdentity(row), row.toObject ? row.toObject() : row);
      for (const row of payload.rows || []) rowsByIdentity.set(rowIdentity(row), row);
      const rows = [...rowsByIdentity.values()];
      if (rows.length > 500) return errorResponse(res, 'An item group can contain at most 500 PPE rows.', [], 400);
      const merged = { ...payload, condition, rows, lastEditedAt: matching.length ? new Date() : undefined };
      if (matching.length) {
        report = await Report.findByIdAndUpdate(matching[0]._id, { $set: merged }, { new: true, runValidators: true });
        const duplicateIds = matching.slice(1).map(item => item._id);
        if (duplicateIds.length) await Report.updateMany({ _id: { $in: duplicateIds } }, { $set: { deleted: true, lastEditedAt: new Date() } });
      } else {
        report = await Report.create({ ...merged, createdBy: req.user._id });
        status = 201;
      }
    }
    if (!report) return errorResponse(res, 'PPE report not found', [], 404);
    return successResponse(res, 'List of PPEs saved', report, status);
  } catch (error) {
    if (['ValidationError', 'CastError'].includes(error.name)) return errorResponse(res, error.message, [], 400);
    throw error;
  }
};
router.post('/', validateAdminForm('ppe-station-reports'), save);
router.put('/:id', validateAdminForm('ppe-station-reports'), save);
module.exports = router;
