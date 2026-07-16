const mongoose = require('mongoose');

let connectPromise = null;
let memoryServer = null;

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    const dbName = 'pcms';
    const configuredUri = process.env.MONGODB_URI;

    if (configuredUri) {
      await mongoose.connect(configuredUri, { dbName });
      return mongoose.connection;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI is required in production');
    }

    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    const memoryUri = memoryServer.getUri();
    await mongoose.connect(memoryUri, { dbName });
    return mongoose.connection;
  })();

  return connectPromise;
}

async function disconnectDatabase() {
  connectPromise = null;

  if (memoryServer) {
    await memoryServer.stop().catch(() => {});
    memoryServer = null;
  }

  await mongoose.disconnect().catch(() => {});
}

module.exports = { connectDatabase, disconnectDatabase };
