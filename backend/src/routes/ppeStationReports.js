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
const fields = ['accountGroup', 'governmentUnit', 'date', 'rows', ...signatoryFields];
router.use(authenticate, adminOnly);
router.get('/', async (req, res) => {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date || '') || Number.isNaN(Date.parse(payload.date)) || new Date(payload.date).toISOString().slice(0, 10) !== payload.date) return errorResponse(res, 'Enter a valid report date', [], 400);
  try {
    const report = req.params.id ? await Report.findByIdAndUpdate(req.params.id, { $set: { ...payload, lastEditedAt: new Date() } }, { new: true, runValidators: true }) : await Report.create({ ...payload, createdBy: req.user._id });
    if (!report) return errorResponse(res, 'PPE report not found', [], 404);
    return successResponse(res, 'List of PPEs saved', report, req.params.id ? 200 : 201);
  } catch (error) {
    if (['ValidationError', 'CastError'].includes(error.name)) return errorResponse(res, error.message, [], 400);
    throw error;
  }
};
router.post('/', validateAdminForm('ppe-station-reports'), save);
router.put('/:id', validateAdminForm('ppe-station-reports'), save);
module.exports = router;
