require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const InspectionAcceptanceReport = require('./src/models/InspectionAcceptanceReport');

async function migrate() {
  await connectDatabase();
  const collection = InspectionAcceptanceReport.collection;
  const indexes = await collection.indexes();
  const numberIndex = indexes.find(index =>
    Object.keys(index.key || {}).length === 1 && index.key.iarNumber === 1
  );

  if (numberIndex && (numberIndex.unique !== true || numberIndex.sparse !== true)) {
    await collection.dropIndex(numberIndex.name);
  }

  const refreshedIndexes = await collection.indexes();
  const sparseUniqueIndex = refreshedIndexes.some(index =>
    Object.keys(index.key || {}).length === 1 && index.key.iarNumber === 1 && index.unique === true && index.sparse === true
  );
  if (!sparseUniqueIndex) await collection.createIndex({ iarNumber: 1 }, { unique: true, sparse: true });
  console.log('IAR number index now allows multiple records without an IAR No.');
}

migrate()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await disconnectDatabase(); mongoose.disconnect(); });
