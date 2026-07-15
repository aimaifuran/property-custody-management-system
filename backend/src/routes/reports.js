const express = require('express');
const Supplier = require('../models/Supplier');
const Inventory = require('../models/Inventory');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const { successResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/inventory', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const inventories = await Inventory.find({ deleted: false }).populate('item').populate('supplier');
  return successResponse(res, 'Inventory report', inventories);
});

router.get('/suppliers', authenticate, authorize('canViewSuppliers'), async (req, res) => {
  const suppliers = await Supplier.find({ deleted: false });
  return successResponse(res, 'Supplier report', suppliers);
});

router.get('/ris', authenticate, authorize('canViewRIS'), async (req, res) => {
  const ris = await RequisitionIssueSlip.find({ deleted: false });
  return successResponse(res, 'RIS report', ris);
});

router.get('/iar', authenticate, authorize('canViewIAR'), async (req, res) => {
  const iar = await InspectionAcceptanceReport.find({ deleted: false });
  return successResponse(res, 'IAR report', iar);
});

module.exports = router;