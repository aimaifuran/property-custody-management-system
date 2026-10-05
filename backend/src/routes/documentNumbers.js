const express = require('express');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const PropertyTransferReport = require('../models/PropertyTransferReport');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();
const documents = {
  RIS: { Model: RequisitionIssueSlip, field: 'risNumber' },
  IAR: { Model: InspectionAcceptanceReport, field: 'iarNumber' },
  ICS: { Model: InventoryCustodianSlip, field: 'icsNumber' },
  PAR: { Model: PropertyAcknowledgementReceipt, field: 'parNumber' },
  PTR: { Model: PropertyTransferReport, field: 'ptrNumber' },
};

router.get('/:type', authenticate, authorize(['canViewDashboard', 'canViewRIS', 'canViewIAR']), async (req, res) => {
  const type = req.params.type.toUpperCase();
  const document = documents[type];
  if (!document) return errorResponse(res, 'Unsupported document type', [], 400);

  const year = Number(req.query.year) || new Date().getFullYear();
  const values = await document.Model.find({ deleted: false, [document.field]: new RegExp(`^${type}-${year}-`, 'i') })
    .select(document.field)
    .lean();
  const lastSequence = values.reduce((highest, record) => {
    const match = String(record[document.field] || '').match(/(\d+)$/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  const nextNumber = `${type}-${year}-${String(lastSequence + 1).padStart(4, '0')}`;
  return successResponse(res, 'Next document number generated', { type, year, nextNumber });
});

module.exports = router;
