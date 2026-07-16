const app = require('../src/app');
const { connectDatabase } = require('../src/config/database');

let connectPromise = null;

module.exports = async (req, res) => {
  if (!connectPromise) {
    connectPromise = connectDatabase();
  }

  await connectPromise;
  return app(req, res);
};
