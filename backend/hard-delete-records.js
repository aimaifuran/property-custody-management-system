const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env-file');

if (envIndex < 0 || !args[envIndex + 1]) throw new Error('Pass an explicit --env-file path.');
dotenv.config({ path: path.resolve(__dirname, args[envIndex + 1]), quiet: true });

const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const transactionModelNames = require('./src/utils/softDeleteSamples').modelNames;
const modelNames = [...new Set([
  ...transactionModelNames,
  'User', 'RegistrationRequest', 'PasswordResetRequest',
  'Notification', 'ActivityLog', 'WorkflowEmail',
])];
const protectedCollections = ['settings', 'suppliers', 'offlinerecipients', 'documentsequences'];

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('The selected environment file has no MONGODB_URI.');
  await connectDatabase();

  const models = modelNames.map(name => require(`./src/models/${name}`));
  const counts = {};
  for (const model of models) counts[model.collection.name] = await model.collection.countDocuments({});
  const protectedBefore = {};
  for (const name of protectedCollections) protectedBefore[name] = await mongoose.connection.collection(name).countDocuments({});

  if (!args.includes('--apply')) {
    console.log(JSON.stringify({ dryRun: true, database: mongoose.connection.name, host: mongoose.connection.host, deletes: counts, preserved: protectedBefore }, null, 2));
    return;
  }
  if (!args.includes('--confirm-users-and-transactions')) {
    throw new Error('Add --confirm-users-and-transactions to permanently delete the listed users and transaction records.');
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const model of models) await model.collection.deleteMany({}, { session });
    });
  } finally {
    await session.endSession();
  }

  const remaining = {};
  for (const model of models) remaining[model.collection.name] = await model.collection.countDocuments({});
  if (Object.values(remaining).some(count => count !== 0)) throw new Error(`Hard delete did not empty all target collections: ${JSON.stringify(remaining)}`);
  for (const name of protectedCollections) {
    const after = await mongoose.connection.collection(name).countDocuments({});
    if (after !== protectedBefore[name]) throw new Error(`Preserved collection count changed: ${name}`);
  }
  console.log(JSON.stringify({ hardDeleted: counts, database: mongoose.connection.name, host: mongoose.connection.host, preserved: protectedBefore, verifiedEmpty: true }, null, 2));
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(disconnectDatabase);
