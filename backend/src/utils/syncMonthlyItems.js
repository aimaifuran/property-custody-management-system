const PpeList = require('../models/PpeList');
const Setting = require('../models/Setting');
const { rowKey } = require('./monthlyAccounting');
const { collectMonthlyItems, recapitulate, monthOf } = require('./monthlyItems');
const models = {
  iar: require('../models/InspectionAcceptanceReport'), ris: require('../models/RequisitionIssueSlip'),
  ics: require('../models/InventoryCustodianSlip'), par: require('../models/PropertyAcknowledgementReceipt'),
  cards: require('../models/PropertyCard'), inventory: require('../models/Inventory'),
  ptr: require('../models/PropertyTransferReport'), prs: require('../models/PropertyReturnSlip'),
  returned: require('../models/ReturnedSupply'), items: require('../models/Item'),
  properties: require('../models/Property'),
};
let queue = Promise.resolve();
async function synchronize(selectedMonth) {
  const entries = await Promise.all(Object.entries(models).map(async ([key, model]) => [key, await (key === 'inventory' ? model.find({ deleted: false }).populate('item') : model.find({ deleted: false })).lean()]));
  const groups = collectMonthlyItems(Object.fromEntries(entries));
  const existing = await PpeList.find({ automatic: true }).select('month rows').lean();
  for (const record of existing) if (!groups.has(record.month)) groups.set(record.month, []);
  if (selectedMonth && !groups.has(selectedMonth)) groups.set(selectedMonth, []);
  const settings = await Setting.findOne().lean();
  for (const [month, rows] of groups) {
    const accounting = new Map((existing.find(record => record.month === month)?.rows || []).filter(row => row.accountingManual).map(row => [rowKey(row), row]));
    for (const row of rows) {
      const saved = accounting.get(rowKey(row));
      if (saved) Object.assign(row, { unitCost: saved.unitCost ?? null, totalCost: saved.totalCost ?? null, accountingManual: true });
    }
    const [year, monthNumber] = month.split('-').map(Number);
    const endDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    await PpeList.updateOne({ month, automatic: true }, {
      $set: { rows, recapitulation: recapitulate(rows), referenceLayout: false, deleted: false },
      $setOnInsert: { month, automatic: true, serialNumber: `${year}-${String(monthNumber).padStart(3, '0')}`, lgu: settings?.lguName || 'CARIGARA, LEYTE', fund: '', periodStart: `${month}-01`, periodEnd: `${month}-${endDay}`, reportDate: `${month}-${endDay}`, custodian: settings?.signatories?.issuedBy?.name || '', accountingStaff: '', postedDate: '' },
    }, { upsert: true });
  }
  return PpeList.find({ automatic: true }).sort({ month: -1 }).lean();
}
const syncMonthlyItems = selectedMonth => {
  const task = queue.then(() => synchronize(selectedMonth));
  queue = task.catch(() => {});
  return task;
};
const monthlyItemsMiddleware = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !/^\/api\/(iar|ris|ics|par|property-cards|inventory|items|ptr|prs|returned-supply|properties)(\/|$)/.test(req.path)) return next();
  const send = res.json.bind(res);
  res.json = body => {
    if (res.statusCode >= 400 || body?.success === false) return send(body);
    return syncMonthlyItems(monthOf(new Date()))
      .then(() => send(body))
      .catch(() => { console.error('Monthly report synchronization failed; reports will refresh on their next load.'); return send(body); });
  };
  next();
};
module.exports = { syncMonthlyItems, monthlyItemsMiddleware };
