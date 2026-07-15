require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const bcrypt = require('bcrypt');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { errorResponse } = require('./src/utils/response');

const authRoutes = require('./src/routes/auth');
const supplierRoutes = require('./src/routes/suppliers');
const inventoryRoutes = require('./src/routes/inventory');
const itemRoutes = require('./src/routes/items');
const risRoutes = require('./src/routes/ris');
const iarRoutes = require('./src/routes/iar');
const transferRoutes = require('./src/routes/transfers');
const returnRoutes = require('./src/routes/returns');
const accountabilityRoutes = require('./src/routes/accountabilities');
const userRoutes = require('./src/routes/users');
const reportRoutes = require('./src/routes/reports');
const User = require('./src/models/User');
const Supplier = require('./src/models/Supplier');
const Item = require('./src/models/Item');
const Setting = require('./src/models/Setting');

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(compression());
app.use(morgan('dev'));

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Property Custody Management System API', version: '1.0.0' },
  },
  apis: [path.join(__dirname, 'src/routes/*.js')],
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/auth', authRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/ris', risRoutes);
app.use('/api/iar', iarRoutes);
app.use('/api/ptr', transferRoutes);
app.use('/api/prs', returnRoutes);
app.use('/api/accountabilities', accountabilityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  if (err) {
    console.error('Unhandled error:', err);
    const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
    return errorResponse(res, message, [], 500);
  }
  next();
});

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
      permissions: ['canViewDashboard', 'canViewSuppliers', 'canManageSuppliers', 'canViewRIS', 'canManageRIS', 'canViewIAR', 'canManageIAR', 'canManageInventory', 'canManageUsers', 'canManageSettings'],
    });
    await Supplier.create({ name: 'National Supply Co.', address: 'Manila', contactNumber: '09123456789' });
    await Supplier.create({ name: 'Metro Office Supplies', address: 'Quezon City', contactNumber: '09987654321' });
    await Item.create({ stockNumber: 'STK-1001', unit: 'unit', description: 'Laptop', cost: 45000, quantityOnHand: 10 });
    await Item.create({ stockNumber: 'STK-1002', unit: 'unit', description: 'Printer', cost: 15000, quantityOnHand: 4 });
    await Setting.create({ organizationName: 'Bureau of Supply and Property', governmentAgency: 'Government Supply Office' });
  }
}

async function connectDatabase() {
  const dbName = 'pcms';
  const configuredUri = process.env.MONGODB_URI;

  if (configuredUri) {
    try {
      await mongoose.connect(configuredUri, { dbName });
      console.log(`MongoDB connected (${configuredUri})`);
      return;
    } catch (err) {
      if (process.env.NODE_ENV === 'production') throw err;
      console.warn(`Could not connect to ${configuredUri}: ${err.message}`);
      console.warn('Falling back to in-memory MongoDB for development.');
      await mongoose.disconnect().catch(() => {});
    }
  }

  const mongod = await MongoMemoryServer.create();
  const memoryUri = mongod.getUri();
  await mongoose.connect(memoryUri, { dbName });
  console.log(`MongoDB connected (in-memory: ${memoryUri})`);
}

async function startServer() {
  try {
    await connectDatabase();
    await seedData();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

startServer();
