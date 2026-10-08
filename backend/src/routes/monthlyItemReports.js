const express = require('express');
const mongoose = require('mongoose');
const PpeList = require('../models/PpeList');
const { authenticate, adminOnly } = require('../middlewares/auth');
const { successResponse, errorResponse } = require('../utils/response');
const { syncMonthlyItems } = require('../utils/syncMonthlyItems');
const { monthOf } = require('../utils/monthlyItems');
const { SAVED_REPORT_SORT, sortSavedReports } = require('../utils/savedReportOrder');
const router = express.Router();
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
router.use(authenticate, adminOnly);
router.get('/', async (req, res) => {
  const month = req.query.month || monthOf(new Date());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000 || Number(month.slice(0, 4)) > 2100) return errorResponse(res, 'Select a valid month between 2000 and 2100', [], 400);
  const records = await syncMonthlyItems(month);
  const manual = await PpeList.find({ automatic: false }).sort(SAVED_REPORT_SORT).lean();
  return successResponse(res, 'Monthly item reports synchronized', { report: records.find(record => record.month === month), records: sortSavedReports([...manual, ...records.filter(record => record.rows.length > 0)]) });
});
router.post('/', async (req, res) => {
  const month = String(req.body.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000 || Number(month.slice(0, 4)) > 2100) return errorResponse(res, 'Choose a valid report month', [], 400);
  const reports = await syncMonthlyItems(month);
  const source = reports.find(record => record.month === month);
  if (!source?.rows.length) return errorResponse(res, 'Record items for this month before creating a report form', [], 400);
  const fields = ['serialNumber', 'lgu', 'fund', 'reportDate', 'custodian', 'accountingStaff', 'postedDate'];
  const metadata = Object.fromEntries(fields.filter(field => req.body[field] !== undefined).map(field => [field, req.body[field]]));
  if (!validDate(metadata.reportDate) || (metadata.postedDate && !validDate(metadata.postedDate))) return errorResponse(res, 'Enter valid report dates', [], 400);
  try {
    const report = await PpeList.create({ ...metadata, automatic: false, month, periodStart: source.periodStart, periodEnd: source.periodEnd, rows: source.rows, recapitulation: source.recapitulation, createdBy: req.user._id });
    return successResponse(res, 'New monthly report form saved', report, 201);
  } catch (error) {
    if (['ValidationError', 'CastError'].includes(error.name)) return errorResponse(res, 'Complete the required report fields', [], 400);
    throw error;
  }
});
router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 'Invalid report ID', [], 400);
  const fields = ['serialNumber', 'lgu', 'fund', 'reportDate', 'custodian', 'accountingStaff', 'postedDate'];
  const payload = Object.fromEntries(fields.filter(field => Object.hasOwn(req.body, field)).map(field => [field, req.body[field]]));
  if ((payload.reportDate && !validDate(payload.reportDate)) || (payload.postedDate && !validDate(payload.postedDate))) return errorResponse(res, 'Enter valid dates', [], 400);
  try {
    const report = await PpeList.findOneAndUpdate({ _id: req.params.id }, { $set: { ...payload, lastEditedAt: new Date() } }, { new: true, runValidators: true });
    if (!report) return errorResponse(res, 'Monthly report not found', [], 404);
    return successResponse(res, 'Monthly report details saved', report);
  } catch (error) {
    if (['ValidationError', 'CastError'].includes(error.name)) return errorResponse(res, error.message, [], 400);
    throw error;
  }
});
module.exports = router;
