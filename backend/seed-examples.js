require('dotenv').config();
const { connectDatabase } = require('./src/config/database');
const { seedTwentyExamples } = require('./src/utils/exampleData');

async function seed() {
  await connectDatabase();
  const result = await seedTwentyExamples();
  console.log(`Created ${result.recordsPerForm} examples for each major form.`);
  process.exit(0);
}

seed().catch((error) => { console.error(error); process.exit(1); });
