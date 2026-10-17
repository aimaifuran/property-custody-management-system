const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const IAR = require('../models/InspectionAcceptanceReport');
const idOf = value => String(value?._id || value || '');

// Use the same exact unit (or latest untracked receipt) used during RIS issuance.
module.exports = async function resolveRisItemFunds(rows, fallback = '', session = null) {
  const stocks = await Item.find({ deleted: false, stockNumber: { $in: rows.map(row => row.stockNumber).filter(Boolean) } }).select('_id stockNumber').session(session).lean();
  const itemIds = new Map(stocks.map(stock => [stock.stockNumber, idOf(stock)]));
  const inventories = await Inventory.find({ deleted: false, $or: [{ _id: { $in: rows.map(row => row.inventory).filter(value => value && require('mongoose').isValidObjectId(idOf(value))).map(idOf) } }, { item: { $in: stocks.map(stock => stock._id) } }] }).sort({ createdAt: -1, _id: -1 }).session(session).lean();
  const receipts = await IAR.find({ deleted: false, _id: { $in: inventories.map(unit => unit.inspectionAcceptanceReport).filter(Boolean) } }).select('fundCluster responsibilityCenterCode').session(session).lean();
  const receiptMap = new Map(receipts.map(receipt => [idOf(receipt), receipt]));
  const items = rows.map(row => {
    const source = row.inventory ? inventories.find(unit => idOf(unit) === idOf(row.inventory)) : inventories.find(unit => idOf(unit.item) === itemIds.get(row.stockNumber));
    const receipt = receiptMap.get(idOf(source?.inspectionAcceptanceReport));
    return { ...row, fundCluster: receipt?.fundCluster?.trim() || '', responsibilityCenterCode: receipt?.responsibilityCenterCode?.trim() || '' };
  });
  const funds = [...new Set(items.map(row => row.fundCluster).filter(Boolean))];
  if (funds.length > 1) throw new Error('Items from different Fund Clusters must be recorded in separate RIS forms.');
  const centers = [...new Set(items.map(row => row.responsibilityCenterCode).filter(Boolean))];
  if (centers.length > 1) throw new Error('Items from different Responsibility Center Codes must be recorded in separate RIS forms.');
  return { fundCluster: funds[0] || fallback || '', responsibilityCenterCode: centers[0] || '', items };
};
