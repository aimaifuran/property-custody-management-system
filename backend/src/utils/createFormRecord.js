const Setting = require('../models/Setting');
const { successResponse, errorResponse } = require('./response');

// Explicit fields keep record IDs, deletion flags, and automatic source links server-owned.
const createFormRecord = (Model, fields, label, itemsField = 'items') => async (req, res) => {
  const payload = Object.fromEntries(fields.filter(field => req.body[field] !== undefined).map(field => [field, req.body[field]]));
  const items = itemsField ? payload[itemsField] : [payload];
  if (!Array.isArray(items) || items.length < 1 || items.length > 500 || items.some(item => !String(item.description || '').trim())) {
    return errorResponse(res, 'Enter between 1 and 500 items with descriptions', [], 400);
  }
  if (items.some(item => {
    const quantity = item.quantity ?? item.receiptQuantity;
    return quantity === '' || quantity == null || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0;
  })) return errorResponse(res, 'Each item must have a quantity greater than zero', [], 400);
  try {
    if (fields.includes('entityName')) {
      const settings = await Setting.findOne().sort({ createdAt: 1 }).lean();
      if (settings?.entityName) payload.entityName = settings.entityName;
    }
    const numberField = ['icsNumber', 'parNumber', 'ptrNumber', 'prsNumber', 'risNumber', 'iarNumber'].find(field => fields.includes(field));
    if (numberField && !String(payload[numberField] || '').trim()) payload[numberField] = await require('./documentNumber').nextDocumentNumber(Model, numberField);
    const record = await Model.create(payload);
    return successResponse(res, `${label} created`, record, 201);
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 'That document number already exists', [], 409);
    if (error.name === 'ValidationError' || error.name === 'CastError') return errorResponse(res, 'Check the form fields and try again', [], 400);
    throw error;
  }
};
module.exports = createFormRecord;
