require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const { softDeleteSamples } = require('./src/utils/softDeleteSamples');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI must identify the existing database; refusing to create an empty test database.');
  await connectDatabase();
  console.log(JSON.stringify(await softDeleteSamples({ apply: process.argv.includes('--apply') }), null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(disconnectDatabase);
