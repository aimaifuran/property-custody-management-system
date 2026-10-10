const app = require('../src/app');
const { connectDatabase } = require('../src/config/database');
const { bootstrapSeed } = require('../src/utils/bootstrapSeed');

let connectPromise = null;
let seedPromise = null;

module.exports = async (req, res) => {
  if (!connectPromise) {
    connectPromise = connectDatabase();
  }

  await connectPromise;
  if (!seedPromise) {
    seedPromise = bootstrapSeed().then(() => require('../src/models/WorkflowEmail').init());
  }
  await seedPromise;
  return app(req, res);
};
