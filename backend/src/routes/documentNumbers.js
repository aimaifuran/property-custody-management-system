const express = require('express');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const PropertyTransferReport = require('../models/PropertyTransferReport');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();
const documents = {
  RIS: { Model: RequisitionIssueSlip, field: 'risNumber' },
  IAR: { Model: InspectionAcceptanceReport, field: 'iarNumber' },
  ICS: { Model: InventoryCustodianSlip, field: 'icsNumber' },
  PAR: { Model: PropertyAcknowledgementReceipt, field: 'parNumber' },
  PTR: { Model: PropertyTransferReport, field: 'ptrNumber' },
  PRS: { Model: PropertyReturnSlip, field: 'prsNumber' },
};

router.get('/:type', authenticate, authorize(['canViewDashboard', 'canViewRIS', 'canViewIAR']), async (req, res) => {
  const type = req.params.type.toUpperCase();
  const document = documents[type];
  if (!document) return errorResponse(res, 'Unsupported document type', [], 400);

  let nextNumber;
  try { nextNumber = await require('../utils/documentNumber').nextDocumentNumber(document.Model, document.field); }
  catch (error) {
    if (error.code === 'DOCUMENT_NUMBER_EXHAUSTED') return errorResponse(res, error.message, [], 400);
    throw error;
  }
  const [year, month] = type === 'IAR' ? [null, null] : nextNumber.split('-').map(Number);
  return successResponse(res, 'Next document number generated', { type, year, month, nextNumber });
});

module.exports = router;
