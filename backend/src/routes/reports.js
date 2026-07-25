const express = require('express');
const Supplier = require('../models/Supplier');
const Inventory = require('../models/Inventory');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const PropertyCard = require('../models/PropertyCard');
const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const PropertyTransferReport = require('../models/PropertyTransferReport');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
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

router.get('/summary', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const [
    suppliers,
    iar,
    ris,
    inventory,
    propertyCards,
    ics,
    par,
    ptr,
    prs,
    returnedSupply,
  ] = await Promise.all([
    Supplier.countDocuments({ deleted: false }),
    InspectionAcceptanceReport.countDocuments({ deleted: false }),
    RequisitionIssueSlip.countDocuments({ deleted: false }),
    Inventory.countDocuments({ deleted: false }),
    PropertyCard.countDocuments({ deleted: false }),
    InventoryCustodianSlip.countDocuments({ deleted: false }),
    PropertyAcknowledgementReceipt.countDocuments({ deleted: false }),
    PropertyTransferReport.countDocuments({ deleted: false }),
    PropertyReturnSlip.countDocuments({ deleted: false }),
    ReturnedSupply.countDocuments({ deleted: false }),
  ]);

  const statusBreakdown = await Inventory.aggregate([
    { $match: { deleted: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const canViewUsers = req.user.role === 'admin' || req.user.permissions?.includes('canManageUsers');
  const users = canViewUsers ? await User.countDocuments({ deleted: false }) : null;

  const recentActivity = await ActivityLog.find({})
    .populate('user', 'firstName lastName username')
    .sort({ createdAt: -1 })
    .limit(10);

  return successResponse(res, 'Dashboard summary', {
    counts: { suppliers, iar, ris, inventory, propertyCards, ics, par, ptr, prs, returnedSupply, users },
    inventoryStatus: statusBreakdown.map((entry) => ({ status: entry._id, count: entry.count })),
    recentActivity,
  });
});

module.exports = router;
