const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
const Accountability = require('../models/PropertyAccountability');
const { ownerFilter } = require('./accountLinks');

async function accountRecords(user, includeRequests = false) {
  const records = await RequisitionIssueSlip.find({ deleted: false, ...ownerFilter(user._id), ...(!includeRequests ? { status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } } : {}) }).sort({ createdAt: -1 });
  const slips = await PropertyReturnSlip.find({ deleted: false, 'items.ris': { $in: records.map(record => record._id) } }).sort({ createdAt: -1 });
  const directReturns = await ReturnedSupply.find({ deleted: false, prs: null, ris: { $in: records.map(record => record._id) } });
  const custody = await Accountability.find({ deleted: false, ris: { $in: records.map(record => record._id) } }).lean();
  const items = records.flatMap(ris => ris.items.filter(item => { const row = custody.find(row => String(row.ris) === String(ris._id) && String(row.risItem) === String(item._id)); return includeRequests || (item.quantityIssued > 0 && (!row || String(row.user) === String(user._id))); }).map(item => {
    const asset = custody.find(row => String(row.ris) === String(ris._id) && String(row.risItem) === String(item._id));
    const transferred = asset && String(asset.user) !== String(user._id);
    const issued = ['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(ris.status);
    const returns = slips.flatMap(slip => slip.items.filter(entry => String(entry.ris) === String(ris._id) && String(entry.risItem) === String(item._id)).map(entry => ({ quantity: entry.quantity, prsNumber: slip.prsNumber, status: slip.status || 'RETURNED', rejectionReason: slip.rejectionReason, date: slip.returnedTo?.date || slip.createdAt, receivedBy: slip.returnedTo?.name, note: slip.note })));
    returns.push(...directReturns.filter(entry => String(entry.ris) === String(ris._id) && String(entry.risItem) === String(item._id)).map(entry => ({ quantity: entry.quantity, prsNumber: 'Returned Supply', status: 'RETURNED', date: entry.returnedTo?.date || entry.createdAt, receivedBy: entry.returnedTo?.name, note: entry.note })));
    const quantityReturned = returns.filter(entry => entry.status === 'RETURNED').reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const pendingReturn = returns.some(entry => entry.status === 'PENDING');
    const requestStatuses = { DRAFT: 'Recorded request', PENDING_REVIEW: 'Pending admin review', PENDING_APPROVAL: 'Pending approval', REVIEWED: 'Reviewed — awaiting issuance', APPROVED: 'Approved — awaiting issuance', REJECTED: 'Request rejected' };
    return { risId: ris._id, itemId: item._id, risNumber: ris.risNumber, requestStatus: ris.status, recordedAt: ris.createdAt, quantityRequested: item.quantityRequested, issued, formType: item.formType, documentNumber: item.documentNumber, formId: item.issuanceForm, unitCost: item.unitCost, description: item.description, unit: item.unit, stockNumber: item.stockNumber, quantityIssued: issued ? item.quantityIssued : 0, issuedAt: issued ? ris.issuedAt : null, quantityReturned, pendingReturn: pendingReturn || !!asset?.pendingMovement, transferred, acceptedAt: asset?.acceptedAt, quantityRemaining: issued && !transferred ? Math.max(0, item.quantityIssued - quantityReturned) : 0, status: transferred ? 'Transferred to another custodian' : !issued ? requestStatuses[ris.status] || 'Recorded request' : pendingReturn ? 'Awaiting admin confirmation' : quantityReturned >= item.quantityIssued && item.quantityIssued > 0 ? 'Successfully returned' : quantityReturned > 0 ? 'Partially returned' : item.quantityIssued > 0 ? 'Not returned' : 'Not issued', returns };
  }));
  return items;
}
module.exports = { accountRecords };
