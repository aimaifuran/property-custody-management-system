require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const RIS = require('./src/models/RequisitionIssueSlip');
const Item = require('./src/models/Item');
const User = require('./src/models/User');
const issueRis = require('./src/utils/issueRis');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI must identify the existing database.');
  const number = process.argv[process.argv.indexOf('--ris') + 1];
  if (!process.argv.includes('--ris') || !number) throw new Error('Specify --ris with the exact document number.');
  await connectDatabase();
  const ris = await RIS.findOne({ risNumber: number, deleted: false });
  if (!ris) throw new Error('RIS not found');
  const lines = ris.items.filter(row => row.quantityRequested > row.quantityIssued && row.quantityIssued > 0);
  if (lines.length !== 1) throw new Error('Expected exactly one under-issued request line; no change made.');
  const line = lines[0];
  const stock = await Item.findOne({ stockNumber: line.stockNumber, deleted: false });
  const missing = line.quantityRequested - line.quantityIssued;
  const plan = { ris: number, requested: line.quantityRequested, alreadyIssued: line.quantityIssued, additional: missing, stockBefore: stock.quantityOnHand, stockAfter: stock.quantityOnHand - missing };
  if (!process.argv.includes('--apply')) return console.log(JSON.stringify({ dryRun: true, ...plan }));
  const admin = await User.findOne({ role: 'admin', deleted: false, username: 'admin' }) || await User.findOne({ role: 'admin', deleted: false });
  if (!admin) throw new Error('Administrator account not found');
  await issueRis(ris._id, admin, {}, { completeQuantity: { lineId: line._id, target: line.quantityRequested }, silent: true });
  await require('./src/utils/syncMonthlyItems').syncMonthlyItems();
  const updated = await RIS.findById(ris._id);
  console.log(JSON.stringify({ ...plan, issuedAfter: updated.items.filter(row => row.stockNumber === line.stockNumber).reduce((sum, row) => sum + row.quantityIssued, 0), actualStockAfter: (await Item.findById(stock._id)).quantityOnHand }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(disconnectDatabase);
