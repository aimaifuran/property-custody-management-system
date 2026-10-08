const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { authenticate, adminOnly } = require('../middlewares/auth');
const { successResponse, errorResponse } = require('../utils/response');
const { accountName } = require('../utils/accountLinks');
const { reserveDocumentNumber } = require('../utils/documentNumber');
const { notifyUsers, notifyAdmins } = require('../utils/workflowNotifications');
const Accountability = require('../models/PropertyAccountability');
const PTR = require('../models/PropertyTransferReport');
const PRS = require('../models/PropertyReturnSlip');
const ICS = require('../models/InventoryCustodianSlip');
const PAR = require('../models/PropertyAcknowledgementReceipt');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const Card = require('../models/PropertyCard');
const Item = require('../models/Item');
const Inventory = require('../models/Inventory');
const router = express.Router();
router.use(authenticate);

const transaction = handler => async (req, res, next) => {
  try {
    const result = await mongoose.connection.transaction(session => handler(req, session));
    return successResponse(res, result.message || 'Property records updated', result.data, result.status || 200);
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 'A pending movement already exists. Refresh and try again.', [], 409);
    if (error.status || error.name === 'CastError' || error.name === 'ValidationError') return errorResponse(res, error.message, [], error.status || 400);
    next(error);
  }
};
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const log = (req, action, details, session) => ActivityLog.create([{ user: req.user._id, action, details, ipAddress: req.ip, browser: req.get('user-agent') }], { session });

router.get('/stock', adminOnly, async (req, res) => successResponse(res, 'Stock classification', await Item.find({ deleted: false }).select('stockNumber description itemType quantityOnHand').sort({ stockNumber: 1 }).lean()));
router.post('/stock/:id/classify', adminOnly, transaction(async (req, session) => {
  if (!['SUPPLY', 'ASSET'].includes(req.body.itemType)) fail('Select Supply or Asset');
  const item = await Item.findOne({ _id: req.params.id, deleted: false }).session(session);
  if (!item) fail('Stock item not found', 404);
  const inventory = await Inventory.find({ item: item._id, deleted: false }).select('_id').session(session);
  if (await Accountability.exists({ inventory: { $in: inventory.map(row => row._id) }, active: true, deleted: false }).session(session)) fail('Return outstanding assets before changing the stock classification', 409);
  item.itemType = req.body.itemType; await item.save({ session });
  await log(req, 'Stock classified', `${item.stockNumber}: ${item.itemType}`, session);
  return { data: item, message: 'Stock classification updated for future issuances' };
}));

router.get('/assets', async (req, res) => {
  const query = { deleted: false, active: true, ...(req.user.role === 'admin' ? {} : { user: req.user._id }) };
  const rows = await Accountability.find(query).populate({ path: 'inventory', populate: { path: 'item' } }).sort({ createdAt: -1 }).lean();
  return successResponse(res, 'Current accountabilities', rows.map(row => ({ ...row, quantityRemaining: Math.max(0, Number(row.quantity || 0) - Number(row.returnedQuantity || 0)) })));
});

router.get('/forms/:type/:id', async (req, res) => {
  const Model = req.params.type === 'ICS' ? ICS : req.params.type === 'PAR' ? PAR : null;
  if (!Model) return errorResponse(res, 'Select ICS or PAR', [], 400);
  const form = await Model.findOne({ _id: req.params.id, deleted: false, ...(req.user.role === 'admin' ? {} : { user: req.user._id }) });
  if (!form) return errorResponse(res, 'Form not found under your account', [], 404);
  return successResponse(res, 'Accountability form', form);
});

router.get('/people', async (req, res) => {
  const people = await User.find({ role: 'user', status: 'active', deleted: false, _id: { $ne: req.user._id } }).select('firstName middleName lastName username office').sort({ firstName: 1 }).lean();
  return successResponse(res, 'Available custodians', people.map(user => ({ _id: user._id, name: accountName(user), office: user.office })));
});

router.get('/transfers', async (req, res) => {
  const rows = await PTR.find({ deleted: false, fromUser: { $exists: true }, ...(req.user.role === 'admin' ? {} : { $or: [{ fromUser: req.user._id }, { toUser: req.user._id }] }) }).sort({ createdAt: -1 }).lean();
  return successResponse(res, 'Transfer requests', rows);
});

router.get('/returns', async (req, res) => {
  const rows = await PRS.find({ deleted: false, ...(req.user.role === 'admin' ? {} : { submittedBy: req.user._id }) }).sort({ createdAt: -1 }).lean();
  return successResponse(res, 'Return requests', rows);
});

router.get('/notifications', async (req, res) => {
  return successResponse(res, 'Notifications', await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean());
});
router.post('/notifications/:id/read', async (req, res) => {
  const row = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { read: true }, { returnDocument: 'after' });
  if (!row) return errorResponse(res, 'Notification not found', [], 404);
  return successResponse(res, 'Notification read', row);
});

router.post('/forms/:type/:id/accept', transaction(async (req, session) => {
  if (req.user.role !== 'user') fail('Only the assigned custodian can accept a form', 403);
  const Model = req.params.type === 'ICS' ? ICS : req.params.type === 'PAR' ? PAR : null;
  if (!Model) fail('Select ICS or PAR');
  const form = await Model.findOne({ _id: req.params.id, user: req.user._id, deleted: false }).session(session);
  if (!form) fail('Form not found under your account', 404);
  if (form.acceptedAt) return { data: form, message: 'Form already accepted' };
  const rows = await Accountability.find({ issuanceForm: form._id, user: req.user._id, active: true, deleted: false }).session(session);
  if (!rows.length || rows.some(row => row.pendingMovement)) fail('This form has no available accountabilities or a movement is pending', 409);
  form.acceptedAt = new Date(); form.acceptedBy = req.user._id;
  form.receivedBy.date = form.acceptedAt;
  await form.save({ session });
  const signatureHash = crypto.createHash('sha256').update(JSON.stringify({ form: String(form._id), user: String(req.user._id), acceptedAt: form.acceptedAt })).digest('hex');
  await Accountability.updateMany({ _id: { $in: rows.map(row => row._id) } }, { $set: { acceptedAt: form.acceptedAt, acceptedBy: req.user._id, signatureHash } }, { session });
  await log(req, 'Accountability accepted', `${req.params.type} ${form.icsNumber || form.parNumber} accepted by ${accountName(req.user)}`, session);
  await notifyAdmins('Accountability accepted', `${accountName(req.user)} accepted ${req.params.type} ${form.icsNumber || form.parNumber}.`, req.params.type === 'ICS' ? '/inventory-custodian' : '/par', session);
  return { data: form, message: 'Receipt and accountability accepted' };
}));

router.post('/transfers', transaction(async (req, session) => {
  if (req.user.role !== 'user') fail('Transfers must be requested by the current custodian', 403);
  if (!mongoose.isValidObjectId(req.body.accountability) || !mongoose.isValidObjectId(req.body.toUser)) fail('Select a property and receiving user');
  const row = await Accountability.findOne({ _id: req.body.accountability, user: req.user._id, deleted: false, active: true }).populate({ path: 'inventory', populate: { path: 'item' } }).session(session);
  if (!row) fail('Property not found under your account', 404);
  if (!row.acceptedAt) fail('Accept the ICS/PAR before transferring this property');
  if (row.pendingMovement) fail('This property already has a pending movement', 409);
  const receiver = await User.findOne({ _id: req.body.toUser, role: 'user', status: 'active', deleted: false }).session(session);
  if (!receiver || String(receiver._id) === String(req.user._id)) fail('Select a different active receiving user');
  const reason = String(req.body.reason || '').trim();
  if (!reason) fail('A transfer reason is required');
  const sourceForm = await (row.formType === 'ICS' ? ICS : PAR).findById(row.issuanceForm).session(session);
  const ptrNumber = await reserveDocumentNumber(PTR, 'ptrNumber', new Date(), session);
  const [report] = await PTR.create([{ entityName: String(req.body.entityName || sourceForm?.entityName || ''), fundCluster: String(req.body.fundCluster || sourceForm?.fundCluster || ''), transferType: String(req.body.transferType || 'Reassignment'), remarks: String(req.body.remarks || ''), issuedBy: { name: accountName(req.user), designation: req.user.office, date: new Date() }, ptrNumber, date: new Date(), fromUser: req.user._id, toUser: receiver._id, fromAccountableOfficer: accountName(req.user), toAccountableOfficer: accountName(receiver), status: 'PENDING_RECEIVER', reasonForTransfer: reason, items: [{ accountability: row._id, dateAcquired: row.inventory?.purchaseDate, propertyNumber: row.propertyNumber || row.inventory?.propertyNumber, description: row.inventory?.item?.description, amount: (row.quantity - (row.returnedQuantity || 0)) * Number(row.inventory?.unitCost || 0), condition: row.condition }] }], { session });
  row.pendingMovement = `PTR:${report._id}`; await row.save({ session });
  await notifyUsers([receiver._id], 'Property transfer awaiting receipt', `${accountName(req.user)} requested a property transfer to you. Confirm receipt before admin approval.`, '/transfers', session);
  await log(req, 'Transfer requested', report.ptrNumber, session);
  return { data: report, status: 201, message: 'Transfer sent to the receiving custodian' };
}));

router.post('/transfers/:id/receive', transaction(async (req, session) => {
  const report = await PTR.findOne({ _id: req.params.id, toUser: req.user._id, status: 'PENDING_RECEIVER', deleted: false }).session(session);
  if (!report) fail('Transfer awaiting your receipt was not found', 404);
  report.status = 'PENDING_ADMIN'; report.receiverConfirmedAt = new Date();
  report.receivedBy = { name: accountName(req.user), designation: req.user.office, date: report.receiverConfirmedAt };
  await report.save({ session });
  await notifyAdmins('Transfer awaiting approval', `${report.ptrNumber}: ${report.toAccountableOfficer} confirmed receipt.`, '/transfers', session);
  await log(req, 'Transfer receipt confirmed', report.ptrNumber, session);
  return { data: report, message: 'Receipt confirmed; awaiting admin approval' };
}));

router.post('/transfers/:id/approve', adminOnly, transaction(async (req, session) => {
  const report = await PTR.findOne({ _id: req.params.id, status: 'PENDING_ADMIN', deleted: false }).session(session);
  if (!report) fail('Transfer must be confirmed by the receiver before approval', 409);
  const receiver = await User.findOne({ _id: report.toUser, role: 'user', status: 'active', deleted: false }).session(session);
  if (!receiver) fail('Receiving user is no longer active');
  const now = new Date();
  for (const entry of report.items) {
    const row = await Accountability.findOne({ _id: entry.accountability, user: report.fromUser, active: true, deleted: false, pendingMovement: `PTR:${report._id}` }).populate({ path: 'inventory', populate: { path: 'item' } }).session(session);
    if (!row || !row.inventory) fail('The current accountability has changed', 409);
    const remaining = row.quantity - Number(row.returnedQuantity || 0);
    const Model = row.formType === 'ICS' ? ICS : PAR;
    const field = row.formType === 'ICS' ? 'icsNumber' : 'parNumber';
    const number = await reserveDocumentNumber(Model, field, now, session);
    const source = await Model.findById(row.issuanceForm).session(session);
    const [form] = await Model.create([{ [field]: number, ris: row.ris, user: receiver._id, entityName: source?.entityName, fundCluster: source?.fundCluster, office: receiver.office, acceptedAt: report.receiverConfirmedAt, acceptedBy: receiver._id, remarks: `Transfer ${report.ptrNumber}; previous ${row.formType} ${row.documentNumber}`, receivedBy: { name: accountName(receiver), position: receiver.office, date: report.receiverConfirmedAt }, ...(row.formType === 'ICS' ? { receivedFrom: { name: report.fromAccountableOfficer, position: row.office, date: now } } : { issuedBy: { name: accountName(req.user), position: req.user.office, date: now } }), items: [row.formType === 'ICS' ? { quantity: remaining, unit: row.inventory.item?.unit, description: entry.description, unitCost: row.inventory.unitCost, totalCost: remaining * row.inventory.unitCost, inventoryItemNo: row.propertyNumber || row.inventory.item?.stockNumber } : { quantity: remaining, unit: row.inventory.item?.unit, description: entry.description, propertyNumber: row.propertyNumber || row.inventory.item?.stockNumber, dateAcquired: row.inventory.purchaseDate, amount: remaining * row.inventory.unitCost }] }], { session });
    row.transferHistory.push({ from: row.user, to: receiver._id, ptr: report._id, fromDocumentNumber: row.documentNumber, toDocumentNumber: number, date: now });
    row.user = receiver._id; row.employee = accountName(receiver); row.office = receiver.office;
    row.issuanceForm = form._id; row.documentNumber = number;
    row.acceptedAt = report.receiverConfirmedAt; row.acceptedBy = receiver._id; row.pendingMovement = undefined;
    row.signatureHash = crypto.createHash('sha256').update(JSON.stringify({ form: String(form._id), user: String(receiver._id), acceptedAt: report.receiverConfirmedAt, ptr: String(report._id) })).digest('hex');
    await row.save({ session });
    row.inventory.status = 'TRANSFERRED'; await row.inventory.save({ session });
    await Card.updateMany({ deleted: false, 'items.inventory': row.inventory._id }, { $push: { items: { inventory: row.inventory._id, propertyNumber: row.propertyNumber || row.inventory.item?.stockNumber, description: entry.description, date: now, referenceParNo: number, receiptQuantity: 0, itdQuantity: 0, itdOfficeOfficer: accountName(receiver), balanceQuantity: row.inventory.item?.quantityOnHand || 0, amount: remaining * row.inventory.unitCost, remarks: `PTR ${report.ptrNumber}: ${report.fromAccountableOfficer} to ${report.toAccountableOfficer}` } } }, { session });
  }
  report.status = 'APPROVED'; report.approvedBy = { name: accountName(req.user), designation: req.user.office, date: now };
  await report.save({ session });
  await notifyUsers([report.fromUser, report.toUser], 'Transfer approved', `${report.ptrNumber} approved. Accountability now belongs to ${report.toAccountableOfficer}.`, '/transfers', session);
  await log(req, 'Transfer approved', report.ptrNumber, session);
  return { data: report, message: 'Transfer approved and accountability reassigned' };
}));

router.post('/transfers/:id/reject', transaction(async (req, session) => {
  const report = await PTR.findOne({ _id: req.params.id, status: { $in: ['PENDING_RECEIVER', 'PENDING_ADMIN'] }, deleted: false }).session(session);
  if (!report) fail('Pending transfer not found', 404);
  if (req.user.role !== 'admin' && !(report.status === 'PENDING_RECEIVER' && String(report.toUser) === String(req.user._id))) fail('Only the receiver or admin can reject this transfer', 403);
  const reason = String(req.body.reason || '').trim(); if (!reason) fail('A rejection reason is required');
  report.status = 'REJECTED'; report.rejectionReason = reason; await report.save({ session });
  await Accountability.updateMany({ pendingMovement: `PTR:${report._id}` }, { $unset: { pendingMovement: 1 } }, { session });
  await notifyUsers([report.fromUser, report.toUser], 'Transfer rejected', `${report.ptrNumber}: ${reason}`, '/transfers', session);
  await log(req, 'Transfer rejected', `${report.ptrNumber}: ${reason}`, session);
  return { data: report, message: 'Transfer rejected; accountability retained by sender' };
}));

router.post('/returns', transaction(async (req, session) => {
  if (req.user.role !== 'user') fail('Returns must be requested by the current custodian', 403);
  const row = await Accountability.findOne({ _id: req.body.accountability, user: req.user._id, active: true, deleted: false }).populate({ path: 'inventory', populate: { path: 'item' } }).session(session);
  if (!row || !row.inventory) fail('Property not found under your account', 404);
  if (row.pendingMovement) fail('This property already has a pending movement', 409);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > row.quantity - Number(row.returnedQuantity || 0)) fail('Choose a positive whole quantity within your remaining accountability');
  const prsNumber = await reserveDocumentNumber(PRS, 'prsNumber', new Date(), session);
  const [report] = await PRS.create([{ prsNumber, lguName: (await (row.formType === 'ICS' ? ICS : PAR).findById(row.issuanceForm).session(session))?.entityName, status: 'PENDING', submittedBy: req.user._id, pendingKey: `ASSET:${row._id}`, purpose: 'Returned To Stock', note: String(req.body.note || '').trim(), returnedBy: { user: req.user._id, name: accountName(req.user), designation: req.user.office, date: new Date() }, items: [{ accountability: row._id, ris: row.ris, risItem: row.risItem, quantity, unit: row.inventory.item?.unit, description: row.inventory.item?.description, propertyNumber: row.propertyNumber || row.inventory.item?.stockNumber, mrNumber: row.documentNumber, unitValue: row.inventory.unitCost, totalValue: quantity * row.inventory.unitCost }] }], { session });
  row.pendingMovement = `PRS:${report._id}`; await row.save({ session });
  await notifyAdmins('Property return awaiting receipt', `${accountName(req.user)} submitted ${report.prsNumber}. Inspect condition and confirm physical receipt.`, '/returns', session);
  await log(req, 'Return submitted', report.prsNumber, session);
  return { data: report, status: 201, message: 'Return submitted; accountability remains until admin receipt' };
}));

module.exports = router;
