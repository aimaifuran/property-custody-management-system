const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { errorResponse } = require('./utils/response');

const authRoutes = require('./routes/auth');
const supplierRoutes = require('./routes/suppliers');
const inventoryRoutes = require('./routes/inventory');
const itemRoutes = require('./routes/items');
const risRoutes = require('./routes/ris');
const iarRoutes = require('./routes/iar');
const transferRoutes = require('./routes/transfers');
const returnRoutes = require('./routes/returns');
const accountabilityRoutes = require('./routes/accountabilities');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');
const mongoose = require('mongoose');

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    const normalizedOrigin = (origin || '').replace(/\/$/, '');
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
};

app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(compression());
app.use(morgan('dev'));

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Property Custody Management System API', version: '1.0.0' },
  },
  apis: [path.join(__dirname, 'routes/*.js')],
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

const getHealthPayload = () => ({
  ok: true,
  service: 'pcms-backend',
  uptime: Math.round(process.uptime()),
  database: {
    connected: mongoose.connection.readyState === 1,
    state: mongoose.connection.readyState,
  },
  timestamp: new Date().toISOString(),
});

app.get('/health', (req, res) => res.json(getHealthPayload()));
app.get('/api/health', (req, res) => res.json(getHealthPayload()));

app.use((err, req, res, next) => {
  if (err) {
    console.error('Unhandled error:', err);
    const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
    return errorResponse(res, message, [], 500);
  }
  next();
});

module.exports = app;
