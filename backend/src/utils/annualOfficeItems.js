const RIS = require('../models/RequisitionIssueSlip');
const PRS = require('../models/PropertyReturnSlip');
const Property = require('../models/Property');
const Accountability = require('../models/PropertyAccountability');
const ICS = require('../models/InventoryCustodianSlip');
const PAR = require('../models/PropertyAcknowledgementReceipt');
const PropertyCard = require('../models/PropertyCard');

const itemGroup = description => {
  const value = String(description || '').trim();
  const types = [
    [/\b(?:air[\s-]*(?:con(?:ditioners?|ditioning)?|conditioners?|conditioning)|a\/c)\b/i, 'Air Conditioners'],
    [/\b(?:laptops?|notebooks?)\b/i, 'Laptops'],
    [/\b(?:desktops?|computers?|system units?)\b/i, 'Computers'],
    [/\bprinters?\b/i, 'Printers'], [/\bchairs?\b/i, 'Chairs'],
    [/\b(?:tables?|desks?)\b/i, 'Tables and Desks'], [/\bfans?\b/i, 'Electric Fans'],
  ];
  return types.find(([pattern]) => pattern.test(value))?.[1] || value.replace(/\s+/g, ' ').toLowerCase() || 'Unspecified Item';
};

async function annualOfficeItems(year, acquiredOnly = false) {
  const end = new Date(Date.UTC(year + 1, 0, 1) - 8 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(year, 0, 1) - 8 * 60 * 60 * 1000);
  const beforeEnd = date => date && new Date(date) < end;
  const inPeriod = date => beforeEnd(date) && (!acquiredOnly || new Date(date) >= start);
  const [slips, returns, properties, accountabilities, ics, pars, cards] = await Promise.all([
    RIS.find({ deleted: false, status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } }).lean(),
    PRS.find({ deleted: false, status: 'RETURNED' }).lean(),
    Property.find({ deleted: false }).lean(),
    Accountability.find({ deleted: false }).populate({ path: 'inventory', populate: { path: 'item' } }).lean(),
    ICS.find({ deleted: false }).lean(), PAR.find({ deleted: false }).lean(), PropertyCard.find({ deleted: false }).lean(),
  ]);
  const returned = new Map();
  for (const record of returns) {
    if (!beforeEnd(record.returnedTo?.date || record.updatedAt)) continue;
    for (const item of record.items || []) {
      if (!item.ris || !item.risItem) continue;
      const key = `${item.ris}:${item.risItem}`;
      returned.set(key, (returned.get(key) || 0) + Number(item.quantity || 0));
    }
  }
  const rows = [];
  const coveredIars = new Set();
  const propertyNumbers = new Set();
  const add = row => {
    if (row.quantity <= 0) return;
    rows.push({ ...row, group: itemGroup(row.description), office: row.office || 'Office not recorded' });
    if (row.propertyNumber) propertyNumbers.add(row.propertyNumber);
  };
  for (const slip of slips) {
    const date = slip.issuedAt || slip.receivedBy?.date || slip.date || slip.createdAt;
    if (!beforeEnd(date)) continue;
    if (slip.iar) coveredIars.add(String(slip.iar));
    if (!inPeriod(date)) continue;
    for (const item of slip.items || []) add({ id: `${slip._id}:${item._id}`, description: item.description, unit: item.unit, stockNumber: item.stockNumber, quantity: Math.max(0, Number(item.quantityIssued || 0) - (returned.get(`${slip._id}:${item._id}`) || 0)), office: slip.office, custodian: slip.receivedBy?.name || slip.requestedBy?.name, documentNumber: slip.risNumber || 'Unnumbered RIS', date, source: 'RIS' });
  }
  for (const record of accountabilities) {
    const inventory = record.inventory;
    if (!inventory || inventory.deleted || coveredIars.has(String(inventory.inspectionAcceptanceReport)) || !inPeriod(record.issueDate)) continue;
    // Inactive legacy accountabilities do not retain dated return/transfer history.
    if (!record.active) continue;
    add({ id: String(record._id), description: inventory.item?.description, stockNumber: inventory.item?.stockNumber, unit: inventory.item?.unit, propertyNumber: record.propertyNumber || inventory.propertyNumber, quantity: inventory.quantity, office: record.office, custodian: record.employee, documentNumber: record.documentNumber, date: record.issueDate, source: record.formType });
  }
  for (const [records, type] of [[ics, 'ICS'], [pars, 'PAR']]) {
    for (const record of records) {
      if (record.iar || !inPeriod(record.receivedBy?.date || record.createdAt)) continue;
      for (const item of record.items || []) {
        const number = item.propertyNumber || item.inventoryItemNo;
        if (number && propertyNumbers.has(number)) continue;
        add({ id: `${record._id}:${item._id}`, description: item.description, unit: item.unit, propertyNumber: number, quantity: Number(item.quantity || 0), office: record.office, custodian: record.receivedBy?.name, documentNumber: record.icsNumber || record.parNumber || `Unnumbered ${type}`, date: record.receivedBy?.date || record.createdAt, source: type });
      }
    }
  }
  for (const card of cards) {
    if (card.iar) continue;
    for (const item of card.items || []) {
      if (!item.itdOfficeOfficer || !inPeriod(item.date || card.createdAt) || (item.propertyNumber && propertyNumbers.has(item.propertyNumber))) continue;
      add({ id: `${card._id}:${item._id}`, description: item.description, propertyNumber: item.propertyNumber, quantity: Number(item.itdQuantity || 0), office: item.itdOfficeOfficer, documentNumber: card.propertyNumber || 'Unnumbered Property Card', date: item.date || card.createdAt, source: 'Property Card' });
    }
  }
  for (const property of properties) {
    if (!inPeriod(property.acquisitionDate || property.createdAt) || propertyNumbers.has(property.propertyCode)) continue;
    const events = (property.events || []).filter(event => beforeEnd(event.date)).sort((a, b) => new Date(a.date) - new Date(b.date));
    const latest = events.at(-1);
    if (!latest && property.currentCustodian?.assignedDate && !beforeEnd(property.currentCustodian.assignedDate)) continue;
    const status = latest?.status || property.status;
    if (!['ISSUED', 'IN_USE', 'TRANSFERRED'].includes(status)) continue;
    const assignment = [...events].reverse().find(event => event.office || event.custodian);
    add({ id: String(property._id), description: property.propertyName, unit: 'unit', propertyNumber: property.propertyCode, quantity: property.quantity, office: assignment?.office || property.currentCustodian?.office || property.location, custodian: assignment?.custodian || property.currentCustodian?.name, documentNumber: property.propertyCode, date: property.acquisitionDate || property.createdAt, source: 'Property' });
  }
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.group)) grouped.set(row.group, { itemType: row.group, rows: [], quantity: 0 });
    const group = grouped.get(row.group);
    group.rows.push(row); group.quantity += row.quantity;
  }
  return { year, acquiredOnly, groups: [...grouped.values()].sort((a, b) => a.itemType.localeCompare(b.itemType)).map(group => ({ ...group, rows: group.rows.sort((a, b) => a.office.localeCompare(b.office)), offices: [...new Set(group.rows.map(row => row.office))] })) };
}

module.exports = { annualOfficeItems, itemGroup };
