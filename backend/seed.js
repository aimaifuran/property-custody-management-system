require('dotenv').config();
const { connectDatabase } = require('./src/config/database');
const { bootstrapSeed } = require('./src/utils/bootstrapSeed');

async function seed() {
  await connectDatabase();
  const result = await bootstrapSeed();

  console.log(result.seeded ? 'Seed data complete' : 'Seed skipped: already initialized');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
