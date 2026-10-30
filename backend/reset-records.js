const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env-file');
if (envIndex >= 0 && !args[envIndex + 1]) throw new Error('Provide an environment file path.');
require('dotenv').config({ path: envIndex >= 0 ? args[envIndex + 1] : path.join(__dirname, '.env'), quiet: true });
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const { softDeleteSamples, modelNames } = require('./src/utils/softDeleteSamples');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('An existing database connection is required.');
  await connectDatabase();
  const preview = await softDeleteSamples({ clearActivity: true });
  console.log(JSON.stringify(preview, null, 2));
  if (!args.includes('--apply')) return;
  const protectedNames = ['users', 'settings', 'suppliers', 'offlinerecipients', 'documentsequences'];
  const protectedSnapshots = {};
  for (const name of protectedNames) protectedSnapshots[name] = EJSON.stringify(await mongoose.connection.collection(name).find({}).sort({ _id: 1 }).toArray());
  const snapshot = { database: mongoose.connection.name, createdAt: new Date(), collections: {} };
  for (const name of [...modelNames, 'Notification', 'ActivityLog', 'WorkflowEmail']) {
    const Model = require(`./src/models/${name}`);
    snapshot.collections[Model.collection.name] = await Model.collection.find({}).toArray();
  }
  const backup = path.join(__dirname, 'backups', `record-reset-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.writeFileSync(backup, EJSON.stringify(snapshot, null, 2), { flag: 'wx' });
  const result = await softDeleteSamples({ apply: true, clearActivity: true });
  const after = await softDeleteSamples({ clearActivity: true });
  if (Object.values(after.counts).some(count => count !== 0)) throw new Error('Reset finished but records remain; inspect the archive before retrying.');
  for (const name of protectedNames) {
    const actual = EJSON.stringify(await mongoose.connection.collection(name).find({}).sort({ _id: 1 }).toArray());
    if (actual !== protectedSnapshots[name]) throw new Error(`Protected collection changed during reset: ${name}`);
  }
  console.log(JSON.stringify({ ...result, backup, verifiedEmpty: true, accountsAndSettingsPreserved: true }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(disconnectDatabase);
