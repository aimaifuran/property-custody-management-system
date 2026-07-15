require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./src/models/User');
const Supplier = require('./src/models/Supplier');
const Item = require('./src/models/Item');
const Setting = require('./src/models/Setting');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pcms', { dbName: 'pcms' });

  await User.deleteMany({});
  await Supplier.deleteMany({});
  await Item.deleteMany({});
  await Setting.deleteMany({});

  const adminPassword = await bcrypt.hash('Admin123!', 10);
  await User.create({
    firstName: 'System',
    lastName: 'Administrator',
    email: 'admin@pcms.gov',
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
    permissions: ['canViewRIS', 'canCreateRIS'],
  });

  await Supplier.create({ name: 'National Supply Co.', address: 'Manila', contactNumber: '09123456789' });
  await Supplier.create({ name: 'Metro Office Supplies', address: 'Quezon City', contactNumber: '09987654321' });
  await Item.create({ stockNumber: 'STK-1001', unit: 'unit', description: 'Laptop', cost: 45000, quantityOnHand: 10 });
  await Item.create({ stockNumber: 'STK-1002', unit: 'unit', description: 'Printer', cost: 15000, quantityOnHand: 4 });
  await Setting.create({ organizationName: 'Bureau of Supply and Property', governmentAgency: 'Government Supply Office' });

  console.log('Seed data complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
