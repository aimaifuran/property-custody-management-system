const Item = require('../models/Item');
const Inventory = require('../models/Inventory');
const Ledger = require('../models/LedgerTransaction');
const IAR = require('../models/InspectionAcceptanceReport');
const RIS = require('../models/RequisitionIssueSlip');
const PRS = require('../models/PropertyReturnSlip');
const PTR = require('../models/PropertyTransferReport');
const Accountability = require('../models/PropertyAccountability');
const { lineAmount } = require('./formAmounts');
const paths = { IAR: '/iar', RIS: '/ris', ICS: '/inventory-custodian', PAR: '/par', PTR: '/transfers', PRS: '/returns' };
const docLink = (type, doc) => ({ type, id: String(doc._id), number: doc[{ IAR: 'iarNumber', RIS: 'risNumber', ICS: 'icsNumber', PAR: 'parNumber', PTR: 'ptrNumber', PRS: 'prsNumber' }[type]] || 'Unnumbered', date: doc.date || doc.iarDate || doc.createdAt, status: doc.status || (doc.acceptedAt ? 'ACCEPTED' : 'RECORDED'), href: `${paths[type]}?record=${doc._id}` });

module.exports = async function itemPropertyLedger(itemId) {
  const item = await Item.findOne({ _id: itemId, deleted: false }).lean();
  if (!item) return null;
  const inventories = await Inventory.find({ item: item._id, deleted: false }).lean();
  const inventoryIds = inventories.map(row => row._id);
  const inventoryMap = new Map(inventories.map(row => [String(row._id), row]));
  const [ledger, iars, requests, accountabilities] = await Promise.all([
    Ledger.find({ inventory: { $in: inventoryIds }, deleted: false }).sort({ transactionDate: 1, createdAt: 1, _id: 1 }).populate('postedBy', 'firstName lastName username').lean(),
    IAR.find({ _id: { $in: inventories.map(row => row.inspectionAcceptanceReport).filter(Boolean) }, deleted: false }).lean(),
    RIS.find({ 'items.stockNumber': item.stockNumber, deleted: false }).lean(),
    Accountability.find({ inventory: { $in: inventoryIds }, deleted: false }).lean(),
  ]);
  const risIds = requests.map(row => row._id);
  const [ics, pars, transfers, returns] = await Promise.all([
    require('../models/InventoryCustodianSlip').find({ ris: { $in: risIds }, deleted: false }).lean(),
    require('../models/PropertyAcknowledgementReceipt').find({ ris: { $in: risIds }, deleted: false }).lean(),
    PTR.find({ deleted: false, $or: [{ 'items.inventory': { $in: inventoryIds } }, { 'items.accountability': { $in: accountabilities.map(row => row._id) } }] }).lean(),
    PRS.find({ deleted: false, $or: [{ 'items.ris': { $in: risIds } }, { 'items.accountability': { $in: accountabilities.map(row => row._id) } }] }).lean(),
  ]);
  const belongs = doc => doc.items.some(entry => inventoryMap.has(String(entry.inventory)) || accountabilities.some(account => String(account.issuanceForm) === String(doc._id)));
  const relevantIcs = ics.filter(belongs), relevantPars = pars.filter(belongs);
  const relevantReturns = returns.filter(doc => doc.items.some(entry => accountabilities.some(account => String(account._id) === String(entry.accountability)) || requests.some(ris => String(ris._id) === String(entry.ris) && ris.items.some(line => String(line._id) === String(entry.risItem) && line.stockNumber === item.stockNumber))));
  const docs = [...iars.map(doc => ['IAR', doc]), ...requests.map(doc => ['RIS', doc]), ...relevantIcs.map(doc => ['ICS', doc]), ...relevantPars.map(doc => ['PAR', doc]), ...transfers.map(doc => ['PTR', doc]), ...relevantReturns.map(doc => ['PRS', doc])];
  const links = docs.map(([type, doc]) => docLink(type, doc));
  const sourceMap = new Map(links.map(link => [`${link.type}:${link.id}`, link]));
  const resolveSource = row => {
    if (row.sourceType && row.sourceDocument) return sourceMap.get(`${row.sourceType}:${row.sourceDocument}`) || null;
    const type = row.type === 'outgoing' ? 'RIS' : /returned|PRS/i.test(row.description || '') ? 'PRS' : 'IAR';
    const candidates = links.filter(link => link.type === type && link.number === row.reference);
    return candidates.length === 1 ? candidates[0] : null;
  };
  const posted = ledger.filter(row => {
    const link = resolveSource(row);
    return !link || (link.type === 'IAR' ? ['LOGGED_TO_STOCKS', 'INSPECTED_ACCEPTED', 'APPROVED'].includes(link.status) : link.type === 'RIS' ? ['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(link.status) : link.type === 'PRS' ? link.status === 'RETURNED' : true);
  });
  const openingBalance = posted.length ? Number(posted[0].runningBalance) - (posted[0].type === 'incoming' ? Number(posted[0].quantity) : -Number(posted[0].quantity)) : Number(item.quantityOnHand);
  const transactions = posted.map(row => {
    const inventory = inventoryMap.get(String(row.inventory));
    const source = resolveSource(row);
    const type = row.type === 'outgoing' ? 'Issue' : source?.type === 'PRS' || /returned/i.test(row.description || '') ? 'Return' : 'Receipt';
    const person = row.postedBy;
    const request = source?.type === 'RIS' ? requests.find(doc => String(doc._id) === source.id) : null;
    const requestRemarks = request ? [...new Set(request.items
      .filter(entry => entry.inventory ? String(entry.inventory) === String(row.inventory) : entry.stockNumber === item.stockNumber)
      .map(entry => String(entry.remarks || '').trim()).filter(Boolean))].join('; ') : '';
    return { id: String(row._id), date: row.transactionDate || row.createdAt, postedAt: row.createdAt, type, source, reference: row.reference,
      received: row.type === 'incoming' ? Number(row.quantity) : 0, issued: row.type === 'outgoing' ? Number(row.quantity) : 0,
      amount: lineAmount(row.quantity, inventory?.unitCost), unitCost: inventory?.unitCost,
      office: row.office || request?.office || '', person: request?.receivedBy?.name?.trim() || request?.requestedBy?.name || '',
      postedBy: person ? [person.firstName, person.lastName].filter(Boolean).join(' ') || person.username : '',
      remarks: request ? requestRemarks : row.description || '', status: 'POSTED', inventory: String(row.inventory), serialNumber: inventory?.serialNumber || '',
      accountabilityDocuments: request ? links.filter(link => ['ICS', 'PAR'].includes(link.type) && [...ics, ...pars].some(doc => String(doc._id) === link.id && String(doc.ris) === String(request._id))) : [],
    };
  });
  const accountMap = new Map(accountabilities.map(row => [String(row._id), row]));
  for (const transfer of transfers.filter(doc => ['APPROVED', 'RECORDED'].includes(doc.status))) {
    const entries = transfer.items.filter(entry => inventoryMap.has(String(entry.inventory)) || accountMap.has(String(entry.accountability)));
    transactions.push({ id: `PTR:${transfer._id}`, date: transfer.approvedBy?.date || transfer.date || transfer.createdAt, postedAt: transfer.updatedAt, type: 'Transfer', source: docLink('PTR', transfer), reference: transfer.ptrNumber, received: 0, issued: 0, amount: entries.reduce((total, entry) => total + Number(entry.amount || 0), 0), office: transfer.toAccountableOfficer, person: transfer.toAccountableOfficer, remarks: `${transfer.fromAccountableOfficer || ''} to ${transfer.toAccountableOfficer || ''}: ${transfer.reasonForTransfer || ''}`, status: transfer.status });
  }
  for (const report of returns.filter(doc => doc.status === 'RETURNED' && doc.stockPosted)) {
    const entries = report.items.filter(entry => entry.condition === 'Unserviceable' && (accountMap.has(String(entry.accountability)) || requests.some(ris => String(ris._id) === String(entry.ris) && ris.items.some(line => String(line._id) === String(entry.risItem) && line.stockNumber === item.stockNumber))));
    if (entries.length) transactions.push({ id: `PRS:${report._id}:unserviceable`, date: report.returnedTo?.date || report.updatedAt, postedAt: report.updatedAt, type: 'Return', source: docLink('PRS', report), reference: report.prsNumber, received: 0, issued: 0, amount: 0, office: report.returnedBy?.designation || '', remarks: `${entries.reduce((sum, entry) => sum + entry.quantity, 0)} returned unserviceable; unavailable for reuse`, status: 'POSTED' });
  }
  transactions.sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.postedAt) - new Date(b.postedAt) || a.id.localeCompare(b.id));
  let balance = openingBalance;
  for (const row of transactions) { balance += row.received - row.issued; row.balance = balance; }
  const received = transactions.filter(row => row.type === 'Receipt').reduce((sum, row) => sum + row.received, 0);
  const returned = transactions.filter(row => row.type === 'Return').reduce((sum, row) => sum + row.received, 0);
  const issued = transactions.reduce((sum, row) => sum + row.issued, 0);
  return { item, inventories: inventories.map(row => ({ id: String(row._id), propertyNumber: row.propertyNumber, serialNumber: row.serialNumber, status: row.status })), transactions, relatedDocuments: links,
    summary: { openingBalance, received, issued, returned, adjustments: 0, currentBalance: balance, availableStock: item.quantityOnHand, reconciliationNeeded: balance !== item.quantityOnHand, lastMovement: transactions.at(-1)?.date || null },
    exportHeader: { entityName: iars[0]?.entityName || '', fundCluster: [...new Set(iars.map(row => row.fundCluster).filter(Boolean))].join('; '), propertyPlantAndEquipment: item.category, propertyNumber: item.stockNumber, description: item.description, serialNumber: inventories.map(row => row.serialNumber).filter(Boolean).join('; ') },
  };
};
