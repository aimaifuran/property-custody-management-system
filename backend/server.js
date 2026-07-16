require('dotenv').config();

const bcrypt = require('bcrypt');
const User = require('./src/models/User');
const Supplier = require('./src/models/Supplier');
const Item = require('./src/models/Item');
const Setting = require('./src/models/Setting');
const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');

const PORT = process.env.PORT || 5000;

async function seedData() {
  const existingAdmin = await User.findOne({ username: 'admin' });
  if (!existingAdmin) {
    const password = await bcrypt.hash('Admin123!', 10);
    await User.create({
      firstName: 'System',
      lastName: 'Administrator',
      email: 'admin@pcms.gov',
      username: 'admin',
      password,
      office: 'Supply Office',
      division: 'Admin',
      role: 'admin',
      permissions: ['canViewDashboard', 'canViewSuppliers', 'canManageSuppliers', 'canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canViewIAR', 'canManageIAR', 'canManageInventory', 'canManageUsers', 'canManageSettings'],
    });
    await Supplier.create({ name: 'National Supply Co.', address: 'Manila', contactNumber: '09123456789' });
    await Supplier.create({ name: 'Metro Office Supplies', address: 'Quezon City', contactNumber: '09987654321' });
    await Item.create({ stockNumber: 'STK-1001', unit: 'unit', description: 'Laptop', cost: 45000, quantityOnHand: 10 });
    await Item.create({ stockNumber: 'STK-1002', unit: 'unit', description: 'Printer', cost: 15000, quantityOnHand: 4 });
    await Setting.create({ organizationName: 'Bureau of Supply and Property', governmentAgency: 'Government Supply Office' });
  }
}

async function startServer() {
  try {
    await connectDatabase();
    if (process.env.NODE_ENV !== 'production') {
      await seedData();
    }
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, seedData };
