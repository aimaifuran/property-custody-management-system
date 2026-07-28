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
const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const PropertyTransferReport = require('../models/PropertyTransferReport');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');

const ENTITY_NAMES = [
  'Municipal Government of Carigara',
  'Bureau of Supply and Property',
  'LGU Carigara - General Services Office',
  'Municipal Engineering Office',
  "Municipal Treasurer's Office",
];
const FUND_CLUSTERS = ['01', '02'];
const STAFF_NAMES = ['A. Cruz', 'B. Reyes', 'C. Santos', 'D. Mendoza', 'E. Villanueva', 'F. Torres'];
const DESIGNATIONS = ['Supply Officer', 'Administrative Aide', 'Property Custodian', 'Records Officer', 'General Services Officer'];
const DIVISIONS = ['Supply Division', 'General Services Division', 'Administrative Division', 'Property Division'];
const OFFICES = ['Supply Office', 'General Services Office', 'Property Office', 'Planning Office'];
const REQUISITION_PURPOSES = [
  'Replenishment of office supplies and equipment for daily operations.',
  'Requisition for newly issued office equipment.',
  'Restocking of consumable supplies for the current quarter.',
  'Replacement of worn-out equipment and furniture.',
  'Additional supplies for ongoing office projects.',
];

const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

const ITEM_CATALOG = {
  laptop: { stockNumber: 'STK-1001', description: 'Laptop', unit: 'unit', cost: 45000, category: 'ICT Equipment' },
  printer: { stockNumber: 'STK-1002', description: 'Printer', unit: 'unit', cost: 15000, category: 'ICT Equipment' },
  chair: { stockNumber: 'STK-1003', description: 'Office Chair', unit: 'piece', cost: 3500, category: 'Furniture and Fixtures' },
  cabinet: { stockNumber: 'STK-1004', description: 'Steel Filing Cabinet', unit: 'unit', cost: 8500, category: 'Furniture and Fixtures' },
  aircon: { stockNumber: 'STK-1005', description: 'Air Conditioner (1HP)', unit: 'unit', cost: 22000, category: 'Office Equipment' },
  generator: { stockNumber: 'STK-1006', description: 'Generator Set (5kVA)', unit: 'unit', cost: 65000, category: 'Office Equipment' },
  projector: { stockNumber: 'STK-1007', description: 'LCD Projector', unit: 'unit', cost: 28000, category: 'ICT Equipment' },
  photocopier: { stockNumber: 'STK-1008', description: 'Photocopier', unit: 'unit', cost: 85000, category: 'ICT Equipment' },
  desk: { stockNumber: 'STK-1009', description: 'Office Desk', unit: 'piece', cost: 6500, category: 'Furniture and Fixtures' },
  dispenser: { stockNumber: 'STK-1010', description: 'Water Dispenser', unit: 'unit', cost: 4500, category: 'Office Equipment' },
  whiteboard: { stockNumber: 'STK-1011', description: 'Whiteboard', unit: 'piece', cost: 2500, category: 'Furniture and Fixtures' },
  bondpaper: { stockNumber: 'STK-1012', description: 'Bond Paper (Substance 20)', unit: 'ream', cost: 250, category: 'Office Supplies' },
  ballpen: { stockNumber: 'STK-1013', description: 'Ballpen (Box of 12)', unit: 'box', cost: 150, category: 'Office Supplies' },
  ups: { stockNumber: 'STK-1014', description: 'Uninterruptible Power Supply', unit: 'unit', cost: 5500, category: 'ICT Equipment' },
  router: { stockNumber: 'STK-1015', description: 'Wireless Router', unit: 'unit', cost: 3200, category: 'ICT Equipment' },
  bookshelf: { stockNumber: 'STK-1016', description: 'Bookshelf', unit: 'piece', cost: 4200, category: 'Furniture and Fixtures' },
  extinguisher: { stockNumber: 'STK-1017', description: 'Fire Extinguisher', unit: 'unit', cost: 2800, category: 'Office Equipment' },
  firstaid: { stockNumber: 'STK-1018', description: 'First Aid Kit', unit: 'unit', cost: 1800, category: 'Office Equipment' },
  monitor: { stockNumber: 'STK-1019', description: 'Monitor (24-inch)', unit: 'unit', cost: 7500, category: 'ICT Equipment' },
  harddrive: { stockNumber: 'STK-1020', description: 'External Hard Drive (1TB)', unit: 'unit', cost: 3800, category: 'ICT Equipment' },
};

// Each blueprint's combined total cost intentionally sits below or above the
// PhP 50,000 ICS/PAR threshold so the seeded data exercises both branches of
// the IAR auto-creation flow (see routes/iar.js).
const IAR_BLUEPRINTS = [
  [{ item: 'bondpaper', qty: 5 }, { item: 'ballpen', qty: 10 }, { item: 'whiteboard', qty: 3 }], // 10250 -> ICS
  [{ item: 'chair', qty: 2 }, { item: 'desk', qty: 1 }, { item: 'cabinet', qty: 2 }], // 30500 -> ICS
  [{ item: 'dispenser', qty: 1 }, { item: 'ups', qty: 2 }, { item: 'router', qty: 1 }], // 18700 -> ICS
  [{ item: 'monitor', qty: 3 }, { item: 'harddrive', qty: 2 }], // 30100 -> ICS
  [{ item: 'extinguisher', qty: 1 }, { item: 'firstaid', qty: 2 }, { item: 'bookshelf', qty: 5 }], // 27400 -> ICS
  [{ item: 'printer', qty: 2 }, { item: 'router', qty: 1 }], // 33200 -> ICS
  [{ item: 'chair', qty: 4 }, { item: 'desk', qty: 3 }, { item: 'whiteboard', qty: 2 }], // 38500 -> ICS
  [{ item: 'projector', qty: 1 }, { item: 'ups', qty: 2 }], // 39000 -> ICS
  [{ item: 'aircon', qty: 1 }, { item: 'dispenser', qty: 1 }, { item: 'monitor', qty: 3 }], // 49000 -> ICS (just under)
  [{ item: 'cabinet', qty: 2 }, { item: 'bookshelf', qty: 2 }, { item: 'bondpaper', qty: 10 }, { item: 'ballpen', qty: 20 }], // 30900 -> ICS
  [{ item: 'photocopier', qty: 1 }], // 85000 -> PAR
  [{ item: 'generator', qty: 1 }], // 65000 -> PAR
  [{ item: 'laptop', qty: 2 }, { item: 'printer', qty: 1 }], // 105000 -> PAR
  [{ item: 'laptop', qty: 1 }, { item: 'aircon', qty: 1 }, { item: 'projector', qty: 1 }], // 95000 -> PAR
  [{ item: 'aircon', qty: 3 }], // 66000 -> PAR
  [{ item: 'projector', qty: 2 }], // 56000 -> PAR
  [{ item: 'laptop', qty: 1 }, { item: 'monitor', qty: 1 }], // 52500 -> PAR (just over)
  [{ item: 'aircon', qty: 4 }], // 88000 -> PAR
  [{ item: 'generator', qty: 1 }, { item: 'ups', qty: 2 }], // 76000 -> PAR
  [{ item: 'photocopier', qty: 1 }, { item: 'cabinet', qty: 2 }], // 102000 -> PAR
];

const TRANSFER_TYPES = ['Donation', 'Reassignment', 'Relocation', 'Other'];
const PURPOSES = ['Disposal', 'Repair', 'Returned To Stock', 'Other'];
const CATALOG_ENTRIES = Object.values(ITEM_CATALOG);

async function seedIarChain(suppliers) {
  for (let i = 0; i < IAR_BLUEPRINTS.length; i += 1) {
    const blueprint = IAR_BLUEPRINTS[i];
    const supplier = pick(suppliers, i);
    const entityName = pick(ENTITY_NAMES, i);
    const fundCluster = pick(FUND_CLUSTERS, i);
    const inspector = pick(STAFF_NAMES, i);
    const custodian = pick(STAFF_NAMES, i + 1);
    const seq = String(i + 1).padStart(3, '0');
    const poDate = new Date(Date.UTC(2026, i % 12, 5));
    const iarDate = new Date(Date.UTC(2026, i % 12, 10));
    const invoiceDate = new Date(Date.UTC(2026, i % 12, 8));
    const acceptanceDate = new Date(Date.UTC(2026, i % 12, 12));

    const items = blueprint.map(({ item, qty }) => {
      const catalogEntry = ITEM_CATALOG[item];
      return {
        stockNumber: catalogEntry.stockNumber,
        stockPropertyNumber: catalogEntry.stockNumber,
        description: catalogEntry.description,
        unit: catalogEntry.unit,
        quantity: qty,
        unitCost: catalogEntry.cost,
        totalCost: catalogEntry.cost * qty,
      };
    });

    const iar = await InspectionAcceptanceReport.create({
      entityName,
      fundCluster,
      supplier: supplier._id,
      supplierName: supplier.name,
      poNumber: `PO-2026-${seq}`,
      poDate,
      responsibilityCenterCode: `RCC-${seq}`,
      iarNumber: `IAR-2026-${seq}`,
      iarDate,
      invoiceNumber: `INV-2026-${seq}`,
      invoiceDate,
      inspectionDate: iarDate,
      inspectedBy: inspector,
      acceptanceDate,
      acceptanceStatus: 'Complete',
      custodian,
      receivedBy: custodian,
      acceptedBy: custodian,
      purchaseDate: poDate,
      status: 'LOGGED_TO_STOCKS',
      items,
    });

    // Created before the Property Card so each item row can reference the
    // resulting ICS/PAR number instead of leaving "Reference PAR No." blank.
    const combinedTotalCost = iar.items.reduce((sum, entry) => sum + entry.totalCost, 0);
    const itemsForAccountability = iar.items.map((entry) => ({
      quantity: entry.quantity,
      unit: entry.unit,
      unitCost: entry.unitCost,
      totalCost: entry.totalCost,
      description: entry.description,
      propertyNumber: entry.stockPropertyNumber,
      dateAcquired: iar.purchaseDate || iar.acceptanceDate,
    }));

    let referenceNumber;
    if (combinedTotalCost < 50000) {
      const ics = await InventoryCustodianSlip.create({
        iar: iar._id,
        entityName: iar.entityName,
        fundCluster: iar.fundCluster,
        icsNumber: `ICS-2026-${seq}`,
        items: itemsForAccountability.map((entry) => ({
          quantity: entry.quantity,
          unit: entry.unit,
          unitCost: entry.unitCost,
          totalCost: entry.totalCost,
          description: entry.description,
          inventoryItemNo: entry.propertyNumber,
          estimatedUsefulLife: '5 years',
        })),
        remarks: 'Issued to custodian for official use.',
        receivedFrom: { name: supplier.name, position: 'Supplier', date: iar.acceptanceDate },
        receivedBy: { name: custodian, position: pick(DESIGNATIONS, i), date: iar.acceptanceDate },
      });
      iar.inventoryCustodianSlip = ics._id;
      referenceNumber = ics.icsNumber;
    } else {
      const par = await PropertyAcknowledgementReceipt.create({
        iar: iar._id,
        entityName: iar.entityName,
        fundCluster: iar.fundCluster,
        parNumber: `PAR-2026-${seq}`,
        items: itemsForAccountability.map((entry) => ({
          quantity: entry.quantity,
          unit: entry.unit,
          description: entry.description,
          propertyNumber: entry.propertyNumber,
          dateAcquired: entry.dateAcquired,
          amount: entry.totalCost,
        })),
        remarks: 'Acknowledged receipt of the properties listed above.',
        receivedBy: { name: custodian, position: pick(DESIGNATIONS, i), date: iar.acceptanceDate },
        issuedBy: { name: pick(STAFF_NAMES, i + 2), position: 'Supply Officer', date: iar.acceptanceDate },
      });
      iar.propertyAcknowledgementReceipt = par._id;
      referenceNumber = par.parNumber;
    }

    const propertyCardItems = [];
    for (const [entryIndex, entry] of iar.items.entries()) {
      let item = await Item.findOne({ stockNumber: entry.stockNumber });
      if (!item) {
        item = await Item.create({
          stockNumber: entry.stockNumber,
          unit: entry.unit,
          description: entry.description,
          cost: entry.unitCost,
          quantityOnHand: 0,
        });
      }

      const serialNumber = `SN-${seq}-${entryIndex + 1}`;

      const inventory = await Inventory.create({
        item: item._id,
        serialNumber,
        propertyNumber: entry.stockPropertyNumber,
        quantity: entry.quantity,
        unitCost: entry.unitCost,
        assetCost: entry.totalCost,
        status: 'LOGGED_TO_STOCKS',
        supplier: supplier._id,
        purchaseDate: iar.poDate,
        inspectionAcceptanceReport: iar._id,
      });

      item.quantityOnHand += entry.quantity;
      await item.save();

      await LedgerTransaction.create({
        inventory: inventory._id,
        type: 'incoming',
        quantity: entry.quantity,
        reference: iar.iarNumber,
        description: 'IAR acceptance',
        runningBalance: item.quantityOnHand,
      });

      propertyCardItems.push({
        inventory: inventory._id,
        propertyNumber: entry.stockPropertyNumber,
        description: entry.description,
        serialNumber,
        date: iar.acceptanceDate,
        referenceParNo: referenceNumber,
        receiptQuantity: entry.quantity,
        itdQuantity: 0,
        itdOfficeOfficer: custodian,
        balanceQuantity: entry.quantity,
        amount: entry.totalCost,
        remarks: 'Received in good condition.',
      });
    }

    const primaryCatalogEntry = ITEM_CATALOG[blueprint[0].item];

    const propertyCard = await PropertyCard.create({
      iar: iar._id,
      month: iarDate.toISOString().slice(0, 7),
      poNumber: iar.poNumber,
      entityName: iar.entityName,
      fundCluster: iar.fundCluster,
      propertyPlantAndEquipment: primaryCatalogEntry.category,
      propertyNumber: propertyCardItems[0].propertyNumber,
      description: propertyCardItems[0].description,
      serialNumber: propertyCardItems[0].serialNumber,
      items: propertyCardItems,
    });

    const ris = await RequisitionIssueSlip.create({
      iar: iar._id,
      risNumber: `RIS-2026-${seq}`,
      entityName: iar.entityName,
      fundCluster: iar.fundCluster,
      division: pick(DIVISIONS, i),
      office: pick(OFFICES, i),
      responsibilityCenterCode: iar.responsibilityCenterCode,
      purpose: pick(REQUISITION_PURPOSES, i),
      requestedBy: { name: custodian, designation: pick(DESIGNATIONS, i), date: iar.acceptanceDate },
      approvedBy: { name: pick(STAFF_NAMES, i + 2), designation: 'Municipal Administrator', date: iar.acceptanceDate },
      issuedBy: { name: pick(STAFF_NAMES, i + 3), designation: 'Supply Officer', date: iar.acceptanceDate },
      receivedBy: { name: custodian, designation: pick(DESIGNATIONS, i), date: iar.acceptanceDate },
      date: iar.acceptanceDate,
      status: 'DRAFT',
      items: iar.items.map((entry) => ({
        stockNumber: entry.stockNumber,
        unit: entry.unit,
        description: entry.description,
        quantityRequested: entry.quantity,
        stockAvailable: null,
        isAvailable: null,
        quantityIssued: null,
        totalCost: entry.totalCost,
        remarks: null,
      })),
    });

    iar.propertyCards = [propertyCard._id];
    iar.requisition = ris._id;
    await iar.save();
  }
}

async function seedPtr() {
  for (let i = 0; i < 20; i += 1) {
    const seq = String(i + 1).padStart(3, '0');
    const fromOfficer = pick(STAFF_NAMES, i);
    const toOfficer = pick(STAFF_NAMES, i + 1);
    const transferTypeChoice = pick(TRANSFER_TYPES, i);
    const transferType = transferTypeChoice === 'Other' ? 'Upgrade Replacement' : transferTypeChoice;
    const date = new Date(Date.UTC(2026, i % 12, 15));
    const catalogEntryA = pick(CATALOG_ENTRIES, i);
    const catalogEntryB = pick(CATALOG_ENTRIES, i + 5);

    await PropertyTransferReport.create({
      entityName: pick(ENTITY_NAMES, i + 2),
      fundCluster: pick(FUND_CLUSTERS, i),
      fromAccountableOfficer: fromOfficer,
      toAccountableOfficer: toOfficer,
      ptrNumber: `PTR-2026-${seq}`,
      date,
      transferType,
      items: [
        { dateAcquired: date, propertyNumber: catalogEntryA.stockNumber, description: catalogEntryA.description, amount: catalogEntryA.cost, condition: 'Serviceable' },
        { dateAcquired: date, propertyNumber: catalogEntryB.stockNumber, description: catalogEntryB.description, amount: catalogEntryB.cost, condition: i % 3 === 0 ? 'Serviceable' : 'Good Condition' },
      ],
      remarks: 'Transferred per approved memorandum.',
      reasonForTransfer: `${transferType} of accountable property to another officer.`,
      approvedBy: { name: pick(STAFF_NAMES, i + 2), designation: 'Municipal Administrator', date },
      issuedBy: { name: fromOfficer, designation: pick(DESIGNATIONS, i), date },
      receivedBy: { name: toOfficer, designation: pick(DESIGNATIONS, i + 1), date },
    });
  }
}

async function seedPrsChain() {
  for (let i = 0; i < 20; i += 1) {
    const seq = String(i + 1).padStart(3, '0');
    const lguName = pick(ENTITY_NAMES, i);
    const purposeChoice = pick(PURPOSES, i);
    const purpose = purposeChoice === 'Other' ? 'Reallocation to another office' : purposeChoice;
    const returnDate = new Date(Date.UTC(2026, i % 12, 20));
    const returnedByName = pick(STAFF_NAMES, i);
    const returnedToName = pick(STAFF_NAMES, i + 3);

    const itemCount = (i % 2) + 1;
    const items = Array.from({ length: itemCount }, (_, idx) => {
      const catalogEntry = pick(CATALOG_ENTRIES, i + idx * 4);
      const quantity = 1 + (idx % 3);
      return {
        quantity,
        unit: catalogEntry.unit,
        description: catalogEntry.description,
        propertyNumber: catalogEntry.stockNumber,
        mrNumber: `MR-2026-${seq}-${idx + 1}`,
        unitValue: catalogEntry.cost,
        totalValue: catalogEntry.cost * quantity,
      };
    });

    const returnedBy = { date: returnDate, name: returnedByName, designation: pick(DESIGNATIONS, i) };
    const returnedTo = { date: returnDate, name: returnedToName, designation: pick(DESIGNATIONS, i + 1) };
    const note = 'Returned for proper disposition per inventory review.';

    const prs = await PropertyReturnSlip.create({
      lguName,
      purpose,
      items,
      note,
      returnedBy,
      returnedTo,
    });

    await ReturnedSupply.insertMany(items.map((entry) => ({
      prs: prs._id,
      lguName,
      purpose,
      quantity: entry.quantity,
      unit: entry.unit,
      description: entry.description,
      propertyNumber: entry.propertyNumber,
      mrNumber: entry.mrNumber,
      unitValue: entry.unitValue,
      totalValue: entry.totalValue,
      note,
      returnedBy,
      returnedTo,
    })));
  }
}

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

  const suppliers = await Supplier.create([
    { name: 'National Supply Co.', address: 'Manila', contactNumber: '09123456789' },
    { name: 'Metro Office Supplies', address: 'Quezon City', contactNumber: '09987654321' },
    { name: 'Leyte Provincial Trading', address: 'Tacloban City', contactNumber: '09171234567' },
  ]);

  // Each IAR auto-creates its Property Card, RIS draft, and (based on the
  // combined item total vs the PhP 50,000 threshold) an ICS or PAR record —
  // mirroring the real /api/iar create flow in routes/iar.js.
  await seedIarChain(suppliers);

  // Standalone Property Transfer Reports.
  await seedPtr();

  // Each Property Return Slip auto-creates one Returned Supply record per
  // item — mirroring the real /api/prs create flow in routes/returns.js.
  await seedPrsChain();

  await Setting.create({ organizationName: 'Bureau of Supply and Property', governmentAgency: 'Government Supply Office' });

  return { seeded: true, reason: 'fresh_seed' };
}

module.exports = { bootstrapSeed };
