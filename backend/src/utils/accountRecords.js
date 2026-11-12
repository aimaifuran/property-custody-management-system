const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
const Item = require('../models/Item');
const Accountability = require('../models/PropertyAccountability');
const Inventory = require('../models/Inventory');
const { ownerFilter } = require('./accountLinks');

async function accountRecords(user, includeRequests = false) {
  const records = await RequisitionIssueSlip.find({ deleted: false, ...ownerFilter(user._id, user.offlineRecord), ...(!includeRequests ? { status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } } : {}) }).populate('iar', 'poNumber').sort({ createdAt: -1 });
  const stocks = await Item.find({ stockNumber: { $in: records.flatMap(record => record.items.map(item => item.stockNumber).filter(Boolean)) } }).select('stockNumber displayStockNumber').lean();
  const displayNumbers = new Map(stocks.map(stock => [stock.stockNumber, stock.displayStockNumber || stock.stockNumber]));
  const stockNumbersById = new Map(stocks.map(stock => [String(stock._id), stock.stockNumber]));
  const slips = await PropertyReturnSlip.find({ deleted: false, 'items.ris': { $in: records.map(record => record._id) } }).sort({ createdAt: -1 });
  const directReturns = await ReturnedSupply.find({ deleted: false, prs: null, ris: { $in: records.map(record => record._id) } });
  const custody = await Accountability.find({ deleted: false, ris: { $in: records.map(record => record._id) } }).lean();
  const custodyInventories = await Inventory.find({ _id: { $in: custody.map(row => row.inventory).filter(Boolean) } }).select('propertyNumber inspectionAcceptanceReport item').populate('inspectionAcceptanceReport', 'iarNumber poNumber items').lean();
  const inventoryNumbers = new Map(custodyInventories.map(row => {
    const receiptItem = row.inspectionAcceptanceReport?.items?.find(entry => [entry.inventory, ...(entry.inventories || [])].some(id => String(id?._id || id) === String(row._id)))
      || row.inspectionAcceptanceReport?.items?.find(entry => String(entry.stockNumber || '') === String(stockNumbersById.get(String(row.item)) || '') || String(entry.stockPropertyNumber || '') === String(stockNumbersById.get(String(row.item)) || ''));
    return [String(row._id), { propertyNumber: row.propertyNumber || receiptItem?.inventoryItemNo || '', iarNumber: row.inspectionAcceptanceReport?.iarNumber || '', poNumber: row.inspectionAcceptanceReport?.poNumber || '' }];
  }));
  const items = records.flatMap(ris => ris.items.map(item => {
    const asset = custody.find(row => String(row.ris) === String(ris._id) && String(row.risItem) === String(item._id));
    if (!includeRequests && !(item.quantityIssued > 0 && (!asset || String(user.offlineRecord ? asset.offlineRecipient : asset.user) === String(user._id)))) return null;
    const issued = ['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(ris.status);
    const issuedRecipient = user.offlineRecord
      ? ris.receivedBy?.offlineRecipient || ris.requestedBy?.offlineRecipient
      : ris.receivedBy?.user || ris.requestedBy?.user;
    if (issued && !asset && String(issuedRecipient || '') !== String(user._id)) return null;
    const transferred = asset && String(user.offlineRecord ? asset.offlineRecipient : asset.user) !== String(user._id);
    const returns = slips.flatMap(slip => slip.items.filter(entry => String(entry.ris) === String(ris._id) && String(entry.risItem) === String(item._id)).map(entry => ({ quantity: entry.quantity, condition: entry.condition, prsNumber: slip.prsNumber, status: slip.status || 'RETURNED', rejectionReason: slip.rejectionReason, date: slip.returnedTo?.date || slip.createdAt, receivedBy: slip.returnedTo?.name, note: slip.note })));
    returns.push(...directReturns.filter(entry => String(entry.ris) === String(ris._id) && String(entry.risItem) === String(item._id)).map(entry => ({ quantity: entry.quantity, condition: entry.condition, prsNumber: 'Returned Supply', status: 'RETURNED', date: entry.returnedTo?.date || entry.createdAt, receivedBy: entry.returnedTo?.name, note: entry.note })));
    const quantityReturned = returns.filter(entry => entry.status === 'RETURNED').reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const pendingReturn = returns.some(entry => entry.status === 'PENDING');
    const requestStatuses = { DRAFT: 'Recorded request', PENDING_REVIEW: 'Pending admin review', PENDING_APPROVAL: 'Pending approval', REVIEWED: 'Reviewed — awaiting issuance', APPROVED: 'Approved — awaiting issuance', REJECTED: 'Request rejected' };
    const inventoryDetails = inventoryNumbers.get(String(asset?.inventory || '')) || {};
    return { risId: ris._id, itemId: item._id, accountability: asset?._id, risNumber: ris.risNumber, requestStatus: ris.status, recordedAt: ris.createdAt, quantityRequested: item.quantityRequested, issued, formType: item.formType, documentNumber: item.documentNumber, formId: item.issuanceForm, unitCost: item.unitCost, itemName: item.itemName || '', description: item.description, unit: item.unit, stockNumber: item.stockNumber, displayStockNumber: displayNumbers.get(item.stockNumber) || item.displayStockNumber || String(item.stockNumber || '').replace(/~[a-f0-9]{24}$/i, ''), propertyNumber: inventoryDetails.propertyNumber || asset?.propertyNumber || '', iarNumber: inventoryDetails.iarNumber || '', poNumber: inventoryDetails.poNumber || ris.iar?.poNumber || '', quantityIssued: issued ? item.quantityIssued : 0, issuedAt: issued ? ris.issuedAt : null, quantityReturned, pendingReturn: pendingReturn || !!asset?.pendingMovement, transferred, acceptedAt: asset?.acceptedAt, quantityRemaining: issued && !transferred ? Math.max(0, item.quantityIssued - quantityReturned) : 0, status: transferred ? 'Transferred to another custodian' : !issued ? requestStatuses[ris.status] || 'Recorded request' : pendingReturn ? 'Awaiting admin confirmation' : quantityReturned >= item.quantityIssued && item.quantityIssued > 0 ? 'Successfully returned' : quantityReturned > 0 ? 'Partially returned' : item.quantityIssued > 0 ? 'Not returned' : 'Not issued', returns };
  }).filter(Boolean));
  return items;
}
module.exports = { accountRecords };
