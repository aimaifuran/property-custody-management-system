require('dotenv').config();

const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { bootstrapSeed } = require('./src/utils/bootstrapSeed');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDatabase();
    await bootstrapSeed();
    await require('./src/models/WorkflowEmail').init();
    const { deliverWorkflowEmails } = require('./src/utils/workflowEmails');
    const emailTimer = setInterval(() => { void deliverWorkflowEmails(); }, 60000);
    emailTimer.unref();
    void deliverWorkflowEmails();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
