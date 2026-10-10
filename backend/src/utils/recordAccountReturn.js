const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('./response');
module.exports = (offline = false) => async (req, res) => {
  const mongoose = require('mongoose');
  const Accountability = require('../models/PropertyAccountability');
  const RIS = require('../models/RequisitionIssueSlip');
  const PRS = require('../models/PropertyReturnSlip');
  const { accountRecords } = require('../utils/accountRecords');
  const { accountName } = require('../utils/accountLinks');
  const { validateLinks } = require('../utils/returnLinks');
  const postPropertyReturn = require('../utils/postPropertyReturn');
  const { reserveDocumentNumber } = require('../utils/documentNumber');
  const condition = req.body.condition ?? 'Serviceable';
  if (!['Serviceable', 'Unserviceable'].includes(condition)) return errorResponse(res, 'Choose Serviceable or Unserviceable', [], 400);
  const returnQuantity = Number(req.body.quantity);
  if (!Number.isInteger(returnQuantity) || returnQuantity <= 0) return errorResponse(res, 'Enter a positive whole return quantity', [], 400);
  try {
    const report = await mongoose.connection.transaction(async session => {
      const Model = offline ? require('../models/OfflineRecipient') : User;
      const owner = await Model.findOne({ _id: req.params.id, deleted: false, ...(!offline ? { role: 'user' } : {}) }).session(session);
      if (owner && offline) owner.offlineRecord = true;
      if (!owner) throw new Error('User account not found');
      let asset = null;
      let ris;
      let item;
      let quantity;
      if (req.body.accountability) {
        asset = await Accountability.findOne({ _id: req.body.accountability, [offline ? 'offlineRecipient' : 'user']: owner._id, active: true, deleted: false }).populate('inventory').session(session);
        if (!asset) throw new Error('This item is no longer assigned to this account');
        if (asset.pendingMovement) throw new Error('This item has a pending movement. Complete it through PRS first.');
        ris = await RIS.findById(asset.ris).session(session);
        item = ris?.items.id(asset.risItem);
        quantity = Number(asset.quantity) - Number(asset.returnedQuantity || 0);
      } else {
        const rows = await accountRecords(owner);
        const row = rows.find(row => String(row.risId) === String(req.body.risId) && String(row.itemId) === String(req.body.itemId));
        if (!row?.issued || row.transferred || row.pendingReturn) throw new Error('Select an available issued item for this account');
        quantity = row.quantityRemaining;
        ris = await RIS.findById(row.risId).session(session);
        item = ris?.items.id(row.itemId);
      }
      if (!ris || !['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(ris.status)) throw new Error('The request must be approved and issued before items can be returned.');
      if (!item || quantity <= 0 || returnQuantity > quantity || (req.body.expectedRemaining !== undefined && Number(req.body.expectedRemaining) !== quantity)) throw new Error('The remaining quantity has changed. Refresh the records before returning this item.');
      quantity = returnQuantity;
      const cost = Number(asset?.inventory?.unitCost ?? item.unitCost ?? 0);
      const entry = { accountability: asset?._id, ris: ris._id, risItem: item._id, quantity, unit: item.unit,
        description: item.description, propertyNumber: asset?.propertyNumber || item.stockNumber, mrNumber: ris.risNumber,
        condition, unitValue: cost, totalValue: quantity * cost };
      await validateLinks([entry], null, session);
      const now = new Date();
      const [created] = await PRS.create([{ prsNumber: await reserveDocumentNumber(PRS, 'prsNumber', now, session),
        lguName: ris.entityName, purpose: condition === 'Serviceable' ? 'Returned To Stock' : 'Disposal', status: 'RETURNED',
        returnedBy: { [offline ? 'offlineRecipient' : 'user']: owner._id, name: offline ? owner.name : accountName(owner), designation: owner.designation || owner.position || owner.office, date: now },
        returnedTo: { name: accountName(req.user), designation: req.user.position || req.user.office, date: now },
        items: [entry] }], { session });
      await postPropertyReturn(created, session);
      await ActivityLog.create([{ user: req.user._id, action: 'User item returned', details: `${created.prsNumber}: ${quantity} ${item.description} returned by ${owner.username || owner.name}` }], { session });
      return created;
    });
    return successResponse(res, 'Successfully returned', report, 201);
  } catch (error) { return errorResponse(res, error.message, [], 409); }
};
