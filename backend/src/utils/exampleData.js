const Supplier = require('../models/Supplier');
const Item = require('../models/Item');
const Inventory = require('../models/Inventory');
const LedgerTransaction = require('../models/LedgerTransaction');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const PropertyCard = require('../models/PropertyCard');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const PropertyTransferReport = require('../models/PropertyTransferReport');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
const Property = require('../models/Property');
const ActivityLog = require('../models/ActivityLog');
const Setting = require('../models/Setting');

const pad = (number) => String(number).padStart(4, '0');
const dateFor = (number) => new Date(2026, 0, Math.min(number, 28));
const names = ['Juan Dela Cruz', 'Maria Santos', 'Pedro Reyes', 'Ana Cruz', 'Jose Garcia'];
const descriptions = ['Laptop Computer', 'Office Printer', 'Executive Desk', 'Office Chair', 'Projector'];

async function clearExampleRecords() {
  await Promise.all([
    Supplier.deleteMany({}), Item.deleteMany({}), Inventory.deleteMany({}), LedgerTransaction.deleteMany({}),
    InspectionAcceptanceReport.deleteMany({}), PropertyCard.deleteMany({}), RequisitionIssueSlip.deleteMany({}),
    InventoryCustodianSlip.deleteMany({}), PropertyAcknowledgementReceipt.deleteMany({}),
    PropertyTransferReport.deleteMany({}), PropertyReturnSlip.deleteMany({}), ReturnedSupply.deleteMany({}),
    Property.deleteMany({}), ActivityLog.deleteMany({}), Setting.deleteMany({}),
  ]);
}

async function seedTwentyExamples() {
  await clearExampleRecords();
  const suppliers = await Supplier.insertMany([
    { name: 'National Supply Co.', address: 'Manila', contactNumber: '09123456789' },
    { name: 'Metro Office Supplies', address: 'Quezon City', contactNumber: '09987654321' },
    { name: 'Leyte Technology Traders', address: 'Tacloban City', contactNumber: '09171234567' },
  ]);
  const iars = [];

  for (let number = 1; number <= 20; number += 1) {
    const date = dateFor(number);
    const description = descriptions[(number - 1) % descriptions.length];
    const cost = 12000 + (number * 1000);
    const stockNumber = `STK-2026-${pad(number)}`;
    const propertyNumber = `PROP-2026-${pad(number)}`;
    const custodian = names[(number - 1) % names.length];
    const supplier = suppliers[(number - 1) % suppliers.length];
    const item = await Item.create({ stockNumber, unit: 'unit', description, category: number % 2 ? 'IT Equipment' : 'Office Equipment', cost, quantityOnHand: 1, status: 'IN_STORAGE' });
    const iar = await InspectionAcceptanceReport.create({
      entityName: 'Municipality of Carigara', fundCluster: 'General Fund', supplier: supplier._id, supplierName: supplier.name,
      poNumber: `PO-2026-${pad(number)}`, poDate: date, responsibilityCenterCode: 'LGU-SUPPLY-001',
      iarNumber: `IAR-2026-${pad(number)}`, iarDate: date, invoiceNumber: `INV-2026-${pad(number)}`, invoiceDate: date,
      inspectionDate: date, inspectedBy: 'Alex Cruz', acceptanceDate: date, acceptanceStatus: 'Complete', acceptanceQuantity: 1,
      custodian, receivedBy: custodian, acceptedBy: custodian, status: 'LOGGED_TO_STOCKS',
      items: [{ stockNumber, stockPropertyNumber: propertyNumber, description, unit: 'unit', quantity: 1, unitCost: cost, totalCost: cost, serialNumber: `SN-2026-${pad(number)}`, propertyNumber }],
    });
    const inventory = await Inventory.create({ item: item._id, serialNumber: `SN-2026-${pad(number)}`, propertyNumber, quantity: 1, unitCost: cost, assetCost: cost, status: 'LOGGED_TO_STOCKS', supplier: supplier._id, purchaseDate: date, inspectionAcceptanceReport: iar._id });
    await LedgerTransaction.create({ inventory: inventory._id, type: 'incoming', quantity: 1, reference: iar.iarNumber, description: 'Sample IAR acceptance', runningBalance: 1 });
    const card = await PropertyCard.create({ iar: iar._id, month: '2026-01', poNumber: iar.poNumber, entityName: iar.entityName, fundCluster: iar.fundCluster, propertyNumber, description, serialNumber: `SN-2026-${pad(number)}`, items: [{ inventory: inventory._id, propertyNumber, description, serialNumber: `SN-2026-${pad(number)}`, date, referenceParNo: null, receiptQuantity: 1, itdQuantity: null, balanceQuantity: 1, amount: cost, remarks: 'Sample property card record' }] });
    const ris = await RequisitionIssueSlip.create({ iar: iar._id, risNumber: `RIS-2026-${pad(number)}`, entityName: iar.entityName, fundCluster: iar.fundCluster, division: 'Administration', office: 'Supply Office', responsibilityCenterCode: 'LGU-SUPPLY-001', purpose: `Office operational requirement ${number}`, requestedBy: { name: custodian, designation: 'Department Head', date }, approvedBy: { name: 'Maria Santos', designation: 'Municipal Mayor', date }, issuedBy: { name: 'Pedro Reyes', designation: 'Supply Officer', date }, receivedBy: { name: custodian, designation: 'Property Custodian', date }, date, status: 'PENDING_REVIEW', items: [{ stockNumber, unit: 'unit', description, quantityRequested: 1, stockAvailable: 1, isAvailable: true, quantityIssued: 1, totalCost: cost, remarks: 'Sample request' }], totalQuantity: 1 });
    iar.propertyCards = [card._id]; iar.requisition = ris._id; await iar.save();
    await InventoryCustodianSlip.create({ iar: iar._id, entityName: iar.entityName, fundCluster: iar.fundCluster, icsNumber: `ICS-2026-${pad(number)}`, items: [{ quantity: 1, unit: 'unit', unitCost: cost, totalCost: cost, description, inventoryItemNo: propertyNumber, estimatedUsefulLife: '5 years' }], remarks: 'Sample ICS record', receivedFrom: { name: supplier.name, position: 'Supplier', date }, receivedBy: { name: custodian, position: 'Property Custodian', date } });
    await PropertyAcknowledgementReceipt.create({ iar: iar._id, entityName: iar.entityName, fundCluster: iar.fundCluster, parNumber: `PAR-2026-${pad(number)}`, items: [{ quantity: 1, unit: 'unit', description, propertyNumber, dateAcquired: date, amount: cost }], remarks: 'Sample PAR record', receivedBy: { name: custodian, position: 'Property Custodian', date }, issuedBy: { name: 'Pedro Reyes', position: 'Supply Officer', date } });
    await PropertyTransferReport.create({ entityName: iar.entityName, fundCluster: iar.fundCluster, fromAccountableOfficer: custodian, toAccountableOfficer: names[number % names.length], ptrNumber: `PTR-2026-${pad(number)}`, date, transferType: 'Reassignment', items: [{ dateAcquired: date, propertyNumber, description, amount: cost, condition: 'Good' }], remarks: 'Sample transfer record', reasonForTransfer: 'Office reassignment', approvedBy: { name: 'Maria Santos', designation: 'Municipal Mayor', date }, issuedBy: { name: 'Pedro Reyes', designation: 'Supply Officer', date }, receivedBy: { name: names[number % names.length], designation: 'Property Custodian', date } });
    const prs = await PropertyReturnSlip.create({ prsNumber: `PRS-2026-${pad(number)}`, lguName: 'Municipality of Carigara', purpose: 'Returned To Stock', items: [{ quantity: 1, unit: 'unit', description, propertyNumber, mrNumber: `MR-2026-${pad(number)}`, unitValue: cost, totalValue: cost }], note: 'Sample returned property', returnedBy: { name: custodian, designation: 'Property Custodian', date }, returnedTo: { name: 'Pedro Reyes', designation: 'Supply Officer', date } });
    await ReturnedSupply.create({ prs: prs._id, lguName: 'Municipality of Carigara', purpose: 'Returned To Stock', quantity: 1, unit: 'unit', description, propertyNumber, mrNumber: `MR-2026-${pad(number)}`, unitValue: cost, totalValue: cost, note: 'Sample returned property', returnedBy: prs.returnedBy, returnedTo: prs.returnedTo });
    await Property.create({ propertyCode: `IT-2026-${pad(number)}`, propertyName: description, description: `Sample ${description.toLowerCase()} record`, category: number % 2 ? 'IT Equipment' : 'Office Equipment', acquisitionDate: date, acquisitionCost: cost, supplier: supplier.name, purchaseOrderNumber: iar.poNumber, sourceOfFund: 'General Fund', location: `Office ${((number - 1) % 5) + 1}`, serialNumber: `SN-2026-${pad(number)}`, status: 'AVAILABLE', condition: 'Serviceable', currentCustodian: { name: custodian, office: 'Supply Office', assignedDate: date }, events: [{ action: 'Registered', date, performedBy: 'System Administrator', custodian, office: 'Supply Office', status: 'AVAILABLE', condition: 'Serviceable', remarks: 'Sample property registration' }] });
    iars.push(iar);
  }
  await Setting.create({ organizationName: 'Municipality of Carigara', governmentAgency: 'Supply Office' });
  return { seeded: true, recordsPerForm: 20, iar: iars.length };
}

module.exports = { seedTwentyExamples, clearExampleRecords };
