const express = require('express');
const PropertyCard = require('../models/PropertyCard');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { listRecords } = require('../utils/paginate');
const { propertyCardHistory } = require('../utils/propertyCardHistory');
const router = express.Router();

const PROPERTY_CARD_SEARCH_FIELDS = [
  'poNumber', 'entityName', 'fundCluster', 'propertyPlantAndEquipment', 'propertyNumber',
  'description', 'serialNumber',
];

const mongoose = require('mongoose');
const Item = require('../models/Item');
router.get('/stock-ledger', authenticate, authorize(['canViewRIS', 'canManageInventory', 'canViewDashboard']), async (req, res) => {
  const filter = { deleted: false };
  if (req.query.search) { const escaped = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = ['stockNumber', 'name', 'description', 'category'].map(key => ({ [key]: new RegExp(escaped, 'i') })); }
  if (req.query.category) filter.category = String(req.query.category);
  let initialItemId;
  if (req.query.card && mongoose.isValidObjectId(req.query.card)) {
    const card = await PropertyCard.findById(req.query.card).lean();
    if (card && (card.items || []).some(row => Number(row.itdQuantity) > 0)) { const inventory = await require('../models/Inventory').findOne({ _id: { $in: (card.items || []).map(row => row.inventory).filter(Boolean) } }).lean(); initialItemId = inventory?.item; }
  }
  const items = await Item.find(filter).sort({ stockNumber: 1 }).lean();
  const state = item => Number(item.quantityOnHand) <= 0 ? 'Out of Stock' : item.reorderLevel != null && item.quantityOnHand <= item.reorderLevel ? 'Low Stock' : 'In Stock';
  const summary = { total: items.length, inStock: items.filter(item => item.quantityOnHand > 0).length, lowStock: items.filter(item => state(item) === 'Low Stock').length, outOfStock: items.filter(item => state(item) === 'Out of Stock').length };
  const matching = items.filter(item => !req.query.status || state(item) === req.query.status);
  const page = Math.max(1, parseInt(req.query.page) || 1), limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const inventories = await require('../models/Inventory').find({ item: { $in: matching.map(item => item._id) }, deleted: false }).select('item').lean();
  const invMap = new Map(inventories.map(inv => [String(inv._id), String(inv.item)]));
  const Ledger = require('../models/LedgerTransaction');
  const [movements, receipts] = await Promise.all([
    Ledger.aggregate([{ $match: { inventory: { $in: inventories.map(inv => inv._id) }, deleted: false } }, { $group: { _id: '$inventory', date: { $max: '$transactionDate' } } }]),
    Ledger.aggregate([{ $match: { inventory: { $in: inventories.map(inv => inv._id) }, deleted: false, type: 'incoming', $or: [{ sourceType: 'IAR' }, { sourceType: { $exists: false }, description: { $not: /return|PRS/i } }] } }, { $group: { _id: '$inventory', received: { $max: '$transactionDate' }, posted: { $max: '$createdAt' }, first: { $min: '$createdAt' } } }]),
  ]);
  const latest = new Map();
  for (const row of movements) { const key = invMap.get(String(row._id)); if (!latest.has(key) || latest.get(key) < row.date) latest.set(key, row.date); }
  const received = new Map();
  for (const row of receipts) {
    const key = invMap.get(String(row._id));
    const prior = received.get(key) || {};
    received.set(key, {
      lastReceivedAt: !prior.lastReceivedAt || prior.lastReceivedAt < row.received ? row.received : prior.lastReceivedAt,
      lastReceivedPostedAt: !prior.lastReceivedPostedAt || prior.lastReceivedPostedAt < row.posted ? row.posted : prior.lastReceivedPostedAt,
      firstReceivedAt: !prior.firstReceivedAt || prior.firstReceivedAt > row.first ? row.first : prior.firstReceivedAt,
    });
  }
  const { sortStockItems, isNewStockItem } = require('../utils/stockLedgerOrder');
  const sorted = sortStockItems(matching.map(item => ({ ...item, ...received.get(String(item._id)), stockStatus: state(item), lastMovement: latest.get(String(item._id)) || null })), req.query.sort === 'name' ? 'name' : 'received');
  const visibleItems = sorted.slice((page - 1) * limit, page * limit);
  const cards = await PropertyCard.find({ deleted: false, stockItem: { $in: visibleItems.map(item => item._id) } }).select('stockItem items.itdQuantity entries.itdQuantity').lean();
  const issuedCardItems = new Set(cards.filter(card => [...(card.items || []), ...(card.entries || [])].some(row => Number(row.itdQuantity) > 0)).map(card => String(card.stockItem)));
  const visible = visibleItems.map(item => ({ ...item, isNew: isNewStockItem(item), hasPropertyCard: issuedCardItems.has(String(item._id)) }));
  const categories = await Item.distinct('category', { deleted: false });
  return successResponse(res, 'Item Property Cards retrieved', { initialItemId, items: visible, summary, categories, pagination: { page, limit, total: matching.length, totalPages: Math.max(1, Math.ceil(matching.length / limit)) } });
});
router.get('/stock-ledger/:itemId', authenticate, authorize(['canViewRIS', 'canManageInventory', 'canViewDashboard']), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.itemId)) return errorResponse(res, 'Invalid item', [], 400);
  const issuedCard = await PropertyCard.exists({ deleted: false, stockItem: req.params.itemId, $or: [{ 'items.itdQuantity': { $gt: 0 } }, { 'entries.itdQuantity': { $gt: 0 } }] });
  if (!issuedCard) return errorResponse(res, 'This item has no Property Card until it is issued through RIS.', [], 404);
  const result = await require('../utils/itemPropertyLedger')(req.params.itemId);
  if (!result) return errorResponse(res, 'Item not found', [], 404);
  return successResponse(res, 'Item Property Card retrieved', result);
});

router.get('/', authenticate, authorize('canViewRIS'), async (req, res) => {
  const cards = await listRecords(PropertyCard, req, { baseFilter: { deleted: false }, searchFields: PROPERTY_CARD_SEARCH_FIELDS, populate: ['iar', 'inventory', { path: 'items.inventory', select: 'unitCost' }] });
  const history = Array.isArray(cards) ? cards.map(propertyCardHistory) : { ...cards, items: cards.items.map(propertyCardHistory) };
  return successResponse(res, 'Property cards retrieved', history);
});

router.post('/:id/issue', authenticate, authorize('canManageInventory'), async (req, res) => {
  try {
    const result = await require('../utils/issueRis')(null, req.user, { ip: req.ip, browser: req.get('user-agent') }, {
      approve: true, manualIssue: { cardId: req.params.id, rowId: req.body.rowId, quantity: req.body.quantity, recipient: req.body.recipient, requestId: req.body.requestId },
    });
    return successResponse(res, 'Property Card issuance recorded', result);
  } catch (error) { return errorResponse(res, error.message, [], 400); }
});

router.patch('/:id/missing-field', authenticate, authorize('canManageInventory'), async (req, res) => {
  const { field, value, rowId } = req.body;
  const headers = ['month', 'poNumber', 'fundCluster', 'propertyPlantAndEquipment', 'propertyNumber', 'description', 'serialNumber'];
  const rowFields = ['date', 'referenceParNo', 'itdOfficeOfficer', 'remarks'];
  if (!(rowId ? rowFields : headers).includes(field) || typeof value !== 'string' || !value.trim() || (field !== 'serialNumber' && value.length > 500)) return errorResponse(res, 'Enter a valid missing detail', [], 400);
  if (field === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return errorResponse(res, 'Enter a valid month', [], 400);
  if (field === 'date' && Number.isNaN(Date.parse(value))) return errorResponse(res, 'Enter a valid date', [], 400);
  if (!mongoose.isValidObjectId(req.params.id) || (rowId && !mongoose.isValidObjectId(rowId))) return errorResponse(res, 'Invalid Property Card or row', [], 400);
  const filter = { _id: req.params.id, deleted: false };
  const missing = { $in: [null, '', '?'] };
  if (rowId) filter.items = { $elemMatch: { _id: rowId, [field]: missing } };
  else filter[field] = missing;
  const path = rowId ? `items.$.${field}` : field;
  const card = await PropertyCard.findOneAndUpdate(filter, { $set: { [path]: value.trim(), lastEditedAt: new Date() } }, { new: true, runValidators: true });
  if (!card) return errorResponse(res, 'This detail is already filled or the record is unavailable. Refresh the history.', [], 409);
  await require('../models/ActivityLog').create({ user: req.user._id, action: 'Property Card detail completed', details: `Card ${card._id}, row ${rowId || 'header'}, ${field}: ${value.trim()}`, ipAddress: req.ip, browser: req.get('user-agent') });
  return successResponse(res, 'Property Card detail saved');
});

// Property Card history is written only by receipt, issuance and return workflows.
router.post('/', authenticate, authorize('canManageInventory'), (req, res) => errorResponse(res, 'Property Cards are generated automatically when IAR stock is issued to a user', [], 405));
router.put('/:id', authenticate, authorize(['canManageInventory', 'canManageRIS']), (req, res) => errorResponse(res, 'Property Card history is read-only', [], 405));

module.exports = router;
