const express = require('express');
const Property = require('../models/Property');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();
const categories = ['IT Equipment', 'Office Equipment', 'Furniture and Fixtures', 'Machinery', 'Communication Equipment', 'Other Property'];
const statuses = ['AVAILABLE', 'ISSUED', 'IN_USE', 'TRANSFERRED', 'RETURNED', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'FOR_DISPOSAL', 'DISPOSED'];
const nameOf = (user) => `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;

async function recordActivity(req, action, details) {
  await ActivityLog.create({ user: req.user._id, action, details, ipAddress: req.ip, browser: req.get('user-agent') });
}

router.get('/meta', authenticate, authorize('canViewDashboard'), (req, res) => successResponse(res, 'Property metadata retrieved', { categories, statuses }));

router.get('/', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const { search, category, status, custodian } = req.query;
  const query = { deleted: false };
  if (category) query.category = category;
  if (status) query.status = status;
  if (custodian) query['currentCustodian.name'] = new RegExp(custodian, 'i');
  if (search) query.$or = ['propertyCode', 'propertyName', 'serialNumber', 'category', 'currentCustodian.name'].map((field) => ({ [field]: new RegExp(search, 'i') }));
  const properties = await Property.find(query).sort({ createdAt: -1 });
  return successResponse(res, 'Properties retrieved', properties);
});

router.post('/', authenticate, authorize('canManageInventory'), async (req, res) => {
  const payload = { ...req.body };
  if (!payload.propertyName || !payload.category) return errorResponse(res, 'Property name and category are required', [], 400);
  if (!payload.propertyCode) {
    const prefix = payload.category.split(/\s+/).map((word) => word[0]).join('').slice(0, 4).toUpperCase() || 'PROP';
    const year = new Date(payload.acquisitionDate || Date.now()).getFullYear();
    const count = await Property.countDocuments({ propertyCode: new RegExp(`^${prefix}-${year}-`) });
    payload.propertyCode = `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  payload.status = payload.status || 'AVAILABLE';
  payload.events = [{ action: 'Registered', performedBy: nameOf(req.user), status: payload.status, condition: payload.condition || 'Serviceable', remarks: payload.remarks }];
  try {
    const property = await Property.create(payload);
    await recordActivity(req, 'Property registered', `${property.propertyCode} — ${property.propertyName}`);
    return successResponse(res, 'Property registered', property, 201);
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 'Property code already exists', [], 409);
    throw error;
  }
});

router.put('/:id', authenticate, authorize('canManageInventory'), async (req, res) => {
  delete req.body.events;
  const property = await Property.findOneAndUpdate({ _id: req.params.id, deleted: false }, req.body, { new: true, runValidators: true });
  if (!property) return errorResponse(res, 'Property not found', [], 404);
  await recordActivity(req, 'Property updated', property.propertyCode);
  return successResponse(res, 'Property updated', property);
});

router.post('/:id/actions', authenticate, authorize('canManageInventory'), async (req, res) => {
  const { action, date, custodian, office, status, condition, remarks, expectedQuantity, physicalQuantity } = req.body;
  const property = await Property.findOne({ _id: req.params.id, deleted: false });
  if (!property) return errorResponse(res, 'Property not found', [], 404);
  const nextStatus = status || ({ Issue: 'ISSUED', Transfer: 'TRANSFERRED', Return: 'RETURNED', 'Report damaged': 'DAMAGED', 'Report lost': 'LOST', 'Mark for disposal': 'FOR_DISPOSAL', Dispose: 'DISPOSED', 'Physical inventory': property.status }[action]);
  if (!action || !nextStatus || !statuses.includes(nextStatus)) return errorResponse(res, 'A valid action and status are required', [], 400);
  if (['Issue', 'Transfer'].includes(action) && !custodian) return errorResponse(res, 'A custodian is required for this action', [], 400);
  property.status = nextStatus;
  if (condition) property.condition = condition;
  if (['Issue', 'Transfer'].includes(action)) property.currentCustodian = { name: custodian, office, assignedDate: date || new Date() };
  if (action === 'Return') property.currentCustodian = undefined;
  property.events.push({ action, date: date || new Date(), performedBy: nameOf(req.user), custodian, office, status: nextStatus, condition, remarks, expectedQuantity, physicalQuantity });
  await property.save();
  await recordActivity(req, `Property ${action.toLowerCase()}`, property.propertyCode);
  return successResponse(res, 'Property lifecycle updated', property);
});

router.get('/reports/annual', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const properties = await Property.find({ deleted: false, acquisitionDate: { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) } });
  const countStatus = (value) => properties.filter((property) => property.status === value).length;
  return successResponse(res, 'Annual inventory summary', { year, totalProperties: properties.length, accountedProperties: properties.filter((property) => property.status !== 'LOST').length, missingProperties: countStatus('LOST'), damagedProperties: countStatus('DAMAGED'), forDisposal: countStatus('FOR_DISPOSAL'), disposed: countStatus('DISPOSED') });
});

module.exports = router;
