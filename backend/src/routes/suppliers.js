const express = require('express');
const { body, validationResult } = require('express-validator');
const Supplier = require('../models/Supplier');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, authorize('canViewSuppliers'), async (req, res) => {
  const suppliers = await Supplier.find({ deleted: false }).sort({ createdAt: -1 });
  return successResponse(res, 'Suppliers retrieved', suppliers);
});

router.post('/', authenticate, authorize('canManageSuppliers'), [
  body('name').notEmpty().withMessage('Supplier name is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('contactNumber').notEmpty().withMessage('Contact number is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const existing = await Supplier.findOne({ name: req.body.name, deleted: false });
  if (existing) return errorResponse(res, 'Supplier already exists', [], 409);

  const supplier = await Supplier.create(req.body);
  return successResponse(res, 'Supplier created', supplier, 201);
});

router.put('/:id', authenticate, authorize('canManageSuppliers'), async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!supplier) return errorResponse(res, 'Supplier not found', [], 404);
  return successResponse(res, 'Supplier updated', supplier);
});

router.delete('/:id', authenticate, authorize('canManageSuppliers'), async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, { deleted: true }, { new: true });
  if (!supplier) return errorResponse(res, 'Supplier not found', [], 404);
  return successResponse(res, 'Supplier deleted', supplier);
});

module.exports = router;