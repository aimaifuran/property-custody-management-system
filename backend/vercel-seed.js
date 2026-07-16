require('dotenv').config();

const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const { bootstrapSeed } = require('./src/utils/bootstrapSeed');

async function main() {
  try {
    await connectDatabase();
    const result = await bootstrapSeed();
    console.log(result.seeded ? 'Seed data complete' : 'Seed skipped: already initialized');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('Vercel seed failed:', error);
  process.exit(1);
});
