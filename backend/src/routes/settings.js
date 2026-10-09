const { validateAdminForm } = require('../middlewares/validateAdminForm');
const express = require('express');
const Setting = require('../models/Setting');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();
router.get('/entity-name', authenticate, async (req, res) => {
  const settings = await Setting.findOne().sort({ createdAt: 1 }).lean();
  return successResponse(res, 'Entity Name retrieved', { entityName: settings?.entityName || '' });
});
router.patch('/entity-name', authenticate, authorize('canManageSettings'), async (req, res) => {
  if (typeof req.body.entityName !== 'string' || !req.body.entityName.trim() || req.body.entityName.trim().length > 300) return errorResponse(res, 'Enter an Entity Name of up to 300 characters', [], 400);
  const settings = await Setting.findOneAndUpdate({}, { $set: { entityName: req.body.entityName.trim() } }, { upsert: true, runValidators: true, sort: { createdAt: 1 }, returnDocument: 'after' });
  return successResponse(res, 'Entity Name saved for new forms', { entityName: settings.entityName });
});
const roles = ['requestedBy', 'approvedBy', 'issuedBy', 'receivedBy', 'receivedFrom', 'returnedBy', 'returnedTo', 'inspectedBy', 'custodian', 'accountingStaff'];
router.get('/remembered-signatories', authenticate, async (req, res) => {
  const settings = await Setting.findOne().sort({ createdAt: 1 }).lean();
  return successResponse(res, 'Remembered signatories retrieved', settings?.rememberedSignatories || {});
});
router.patch('/remembered-signatories', authenticate, authorize('canManageSettings'), async (req, res) => {
  const { role, field, value } = req.body;
  if (!roles.includes(role) || !['name', 'designation', 'position'].includes(field) || typeof value !== 'string' || value.length > 200) return errorResponse(res, 'Invalid signatory field', [], 400);
  const updates = { [`rememberedSignatories.${role}.${field}`]: value };
  if (['position', 'designation'].includes(field)) { updates[`rememberedSignatories.${role}.position`] = value; updates[`rememberedSignatories.${role}.designation`] = value; }
  await Setting.findOneAndUpdate({}, { $set: updates }, { upsert: true, runValidators: true, sort: { createdAt: 1 } });
  return successResponse(res, 'Signatory remembered');
});

router.get('/', authenticate, authorize('canManageSettings'), async (req, res) => {
  const settings = await Setting.findOne().sort({ createdAt: 1 });
  return successResponse(res, 'Settings retrieved', settings || await Setting.create({}));
});

router.put('/', authenticate, validateAdminForm('settings'), authorize('canManageSettings'), async (req, res) => {
  const allowed = ['organizationName', 'governmentAgency', 'address', 'telephone', 'footer', 'systemName', 'lguName', 'signatories'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  const settings = await Setting.findOneAndUpdate({}, updates, { new: true, upsert: true, setDefaultsOnInsert: true });
  return successResponse(res, 'Settings updated', settings);
});

module.exports = router;
