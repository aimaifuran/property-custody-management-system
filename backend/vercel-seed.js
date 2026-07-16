require('dotenv').config();

const { connectDatabase } = require('./src/config/database');
const { bootstrapSeed } = require('./src/utils/bootstrapSeed');

async function main() {
  await connectDatabase();
  const result = await bootstrapSeed();
  console.log(result.seeded ? 'Seed data complete' : 'Seed skipped: already initialized');
}

main().catch((error) => {
  console.error('Vercel seed failed:', error);
  process.exit(1);
});
