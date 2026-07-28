const bcrypt = require('bcrypt');
const User = require('../models/User');
const Supplier = require('../models/Supplier');
const Item = require('../models/Item');
const Setting = require('../models/Setting');
const Inventory = require('../models/Inventory');
const LedgerTransaction = require('../models/LedgerTransaction');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const PropertyCard = require('../models/PropertyCard');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');

async function bootstrapSeed() {
  const existingAdmin = await User.findOne({ username: 'admin', deleted: false });
  if (existingAdmin) {
    return { seeded: false, reason: 'already_seeded' };
  }

  const adminPassword = await bcrypt.hash('Admin123!', 10);

  await User.create({
    firstName: 'System',
    lastName: 'Administrator',
    email: 'cheriemae.francisco@evsu.edu.ph',
    username: 'admin',
    password: adminPassword,
    office: 'Supply Office',
    division: 'Admin',
    role: 'admin',
    permissions: ['canViewDashboard', 'canViewSuppliers', 'canManageSuppliers', 'canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS', 'canViewIAR', 'canManageIAR', 'canManageInventory', 'canManageUsers', 'canManageSettings'],
  });

  await User.create({
    firstName: 'Office',
    lastName: 'User',
    email: 'user@pcms.gov',
    username: 'user',
    password: adminPassword,
    office: 'Planning Office',
    division: 'Planning',
    role: 'user',
    permissions: ['canViewDashboard', 'canViewRIS', 'canCreateRIS'],
  });

  const [nationalSupply, metroOffice] = await Supplier.create([
    { name: 'National Supply Co.', address: 'Manila', contactNumber: '09123456789' },
    { name: 'Metro Office Supplies', address: 'Quezon City', contactNumber: '09987654321' },
  ]);
  // Seed the complete document workflow: one IAR is the source of the
  // linked Property Cards and the editable RIS draft.
  const [laptop, printer] = await Item.create([
    { stockNumber: 'STK-1001', unit: 'unit', description: 'Laptop', cost: 45000, quantityOnHand: 0 },
    { stockNumber: 'STK-1002', unit: 'unit', description: 'Printer', cost: 15000, quantityOnHand: 0 },
  ]);
  const acceptanceDate = new Date('2026-07-01T00:00:00.000Z');
  const iar = await InspectionAcceptanceReport.create({
    entityName: 'Bureau of Supply and Property',
    fundCluster: '01',
    supplier: nationalSupply._id,
    supplierName: nationalSupply.name,
    poNumber: 'PO-2026-001',
    poDate: new Date('2026-06-15T00:00:00.000Z'),
    responsibilityCenterCode: 'BSP-ADMIN-001',
    iarNumber: 'IAR-2026-001',
    iarDate: acceptanceDate,
    invoiceNumber: 'INV-2026-001',
    invoiceDate: new Date('2026-06-30T00:00:00.000Z'),
    inspectionDate: acceptanceDate,
    inspectedBy: 'A. Cruz',
    acceptanceDate,
    acceptanceStatus: 'Complete',
    custodian: 'B. Reyes',
    receivedBy: 'B. Reyes',
    acceptedBy: 'B. Reyes',
    status: 'LOGGED_TO_STOCKS',
    items: [
      { stockNumber: laptop.stockNumber, stockPropertyNumber: laptop.stockNumber, description: laptop.description, unit: laptop.unit, quantity: 2, unitCost: laptop.cost, totalCost: 90000 },
      { stockNumber: printer.stockNumber, stockPropertyNumber: printer.stockNumber, description: printer.description, unit: printer.unit, quantity: 1, unitCost: printer.cost, totalCost: 15000 },
    ],
  });

  const seededCardItems = [];
  for (const entry of iar.items) {
    const item = entry.stockNumber === laptop.stockNumber ? laptop : printer;
    const inventory = await Inventory.create({
      item: item._id,
      propertyNumber: entry.stockPropertyNumber,
      quantity: entry.quantity,
      unitCost: entry.unitCost,
      assetCost: entry.totalCost,
      status: 'LOGGED_TO_STOCKS',
      supplier: nationalSupply._id,
      purchaseDate: iar.poDate,
      inspectionAcceptanceReport: iar._id,
    });
    item.quantityOnHand += entry.quantity;
    await item.save();
    await LedgerTransaction.create({ inventory: inventory._id, type: 'incoming', quantity: entry.quantity, reference: iar.iarNumber, description: 'IAR acceptance', runningBalance: item.quantityOnHand });
    seededCardItems.push({ inventory: inventory._id, propertyNumber: entry.stockPropertyNumber, description: entry.description, serialNumber: null, date: iar.acceptanceDate, referenceParNo: null, receiptQuantity: entry.quantity, itdQuantity: null, itdOfficeOfficer: null, balanceQuantity: entry.quantity, amount: entry.totalCost, remarks: null });
  }

  const seededCard = await PropertyCard.create({
    iar: iar._id,
    month: '2026-07',
    poNumber: iar.poNumber,
    entityName: iar.entityName,
    fundCluster: iar.fundCluster,
    items: seededCardItems,
  });

  const ris = await RequisitionIssueSlip.create({
    iar: iar._id,
    entityName: iar.entityName,
    fundCluster: iar.fundCluster,
    division: null,
    office: null,
    responsibilityCenterCode: iar.responsibilityCenterCode,
    purpose: null,
    requestedBy: null,
    receivedBy: null,
    date: null,
    status: 'DRAFT',
    items: iar.items.map((entry) => ({ stockNumber: entry.stockNumber, unit: entry.unit, description: entry.description, quantityRequested: entry.quantity, stockAvailable: null, isAvailable: null, quantityIssued: null, totalCost: entry.totalCost, remarks: null })),
  });
  iar.propertyCards = [seededCard._id];
  iar.requisition = ris._id;
  await iar.save();
  await Setting.create({ organizationName: 'Bureau of Supply and Property', governmentAgency: 'Government Supply Office' });

  return { seeded: true, reason: 'fresh_seed' };
}

module.exports = { bootstrapSeed };
