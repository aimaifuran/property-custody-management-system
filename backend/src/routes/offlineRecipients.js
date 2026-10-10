const express = require('express');
const Model = require('../models/OfflineRecipient');
const { authenticate, adminOnly } = require('../middlewares/auth');
const { successResponse, errorResponse } = require('../utils/response');
const { accountRecords } = require('../utils/accountRecords');
const router = express.Router();
router.use(authenticate, adminOnly);
router.get('/', async (req, res) => successResponse(res, 'Offline records retrieved', await Model.find({ deleted: false }).sort({ createdAt: -1 })));
const save = async (req, res) => {
  const payload = Object.fromEntries(['name', 'office', 'designation', 'notes'].map(key => [key, String(req.body[key] || '').trim()]));
  if (!payload.name || !payload.office) return errorResponse(res, 'Office and recipient name are required', [], 400);
  try {
    const row = req.params.id ? await Model.findOneAndUpdate({ _id: req.params.id, deleted: false }, { $set: payload }, { returnDocument: 'after', runValidators: true }) : await Model.create({ ...payload, createdBy: req.user._id });
    if (!row) return errorResponse(res, 'Offline record not found', [], 404);
    return successResponse(res, 'Offline record saved', row, req.params.id ? 200 : 201);
  } catch (error) { return errorResponse(res, error.message, [], 400); }
};
router.post('/', save);
router.put('/:id', save);
router.get('/:id/records', async (req, res) => {
  const owner = await Model.findOne({ _id: req.params.id, deleted: false });
  if (!owner) return errorResponse(res, 'Offline record not found', [], 404);
  owner.offlineRecord = true;
  const [risRows, assets, returnSlips] = await Promise.all([
    accountRecords(owner, true),
    require('../models/PropertyAccountability').find({ offlineRecipient: owner._id, active: true, deleted: false }).populate({ path: 'inventory', populate: 'item' }).lean(),
    require('../models/PropertyReturnSlip').find({ 'returnedBy.offlineRecipient': owner._id, deleted: false }).lean(),
  ]);
  return successResponse(res, 'Offline records retrieved', { risRows, assets, returnSlips });
});
router.post('/:id/records/returned', require('../utils/recordAccountReturn')(true));
module.exports = router;
