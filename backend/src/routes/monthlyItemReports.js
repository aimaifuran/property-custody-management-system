const express = require('express');
const mongoose = require('mongoose');
const PpeList = require('../models/PpeList');
const { authenticate, adminOnly } = require('../middlewares/auth');
const { successResponse, errorResponse } = require('../utils/response');
const { syncMonthlyItems } = require('../utils/syncMonthlyItems');
const { monthOf } = require('../utils/monthlyItems');
const router = express.Router();
router.use(authenticate, adminOnly);
router.get('/', async (req, res) => {
  const month = req.query.month || monthOf(new Date());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000 || Number(month.slice(0, 4)) > 2100) return errorResponse(res, 'Select a valid month between 2000 and 2100', [], 400);
  const records = await syncMonthlyItems(month);
  return successResponse(res, 'Monthly item reports synchronized', { report: records.find(record => record.month === month), records: records.filter(record => record.rows.length > 0) });
});
router.post('/', (req, res) => errorResponse(res, 'Monthly items are saved automatically when their source records are saved', [], 400));
router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 'Invalid report ID', [], 400);
  const fields = ['serialNumber', 'lgu', 'fund', 'reportDate', 'custodian', 'accountingStaff', 'postedDate'];
  const payload = Object.fromEntries(fields.filter(field => Object.hasOwn(req.body, field)).map(field => [field, req.body[field]]));
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if ((payload.reportDate && !validDate(payload.reportDate)) || (payload.postedDate && !validDate(payload.postedDate))) return errorResponse(res, 'Enter valid dates', [], 400);
  try {
    const report = await PpeList.findOneAndUpdate({ _id: req.params.id, automatic: true }, { $set: payload }, { new: true, runValidators: true });
    if (!report) return errorResponse(res, 'Monthly report not found', [], 404);
    return successResponse(res, 'Monthly report details saved', report);
  } catch (error) {
    if (['ValidationError', 'CastError'].includes(error.name)) return errorResponse(res, error.message, [], 400);
    throw error;
  }
});
module.exports = router;
