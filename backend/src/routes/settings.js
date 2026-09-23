const express = require('express');
const Setting = require('../models/Setting');
const { successResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticate, authorize('canManageSettings'), async (req, res) => {
  const settings = await Setting.findOne().sort({ createdAt: 1 });
  return successResponse(res, 'Settings retrieved', settings || await Setting.create({}));
});

router.put('/', authenticate, authorize('canManageSettings'), async (req, res) => {
  const allowed = ['organizationName', 'governmentAgency', 'address', 'telephone', 'footer', 'systemName', 'lguName', 'signatories'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  const settings = await Setting.findOneAndUpdate({}, updates, { new: true, upsert: true, setDefaultsOnInsert: true });
  return successResponse(res, 'Settings updated', settings);
});

module.exports = router;
