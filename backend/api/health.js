const mongoose = require('mongoose');
const { connectDatabase } = require('../src/config/database');

module.exports = async (req, res) => {
  try {
    await connectDatabase();
    return res.status(200).json({
      ok: true,
      service: 'pcms-backend',
      uptime: Math.round(process.uptime()),
      database: {
        connected: mongoose.connection.readyState === 1,
        state: mongoose.connection.readyState,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      service: 'pcms-backend',
      uptime: Math.round(process.uptime()),
      database: {
        connected: false,
        state: mongoose.connection.readyState,
      },
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
};
