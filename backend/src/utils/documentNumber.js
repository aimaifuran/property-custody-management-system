const DocumentSequence = require('../models/DocumentSequence');

const monthlyPrefix = date => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(date);
  const year = parts.find(part => part.type === 'year').value;
  const month = parts.find(part => part.type === 'month').value;
  return `${year}-${month}-`;
};

const numericIar = (Model, field) => Model.modelName === 'InspectionAcceptanceReport' && field === 'iarNumber';
const numberPrefix = (Model, field, date) => numericIar(Model, field) ? '' : monthlyPrefix(date);
const isValidIarNumber = number => /^[0-9]{3,4}$/.test(String(number));
const iarNumberError = () => new Error('IAR number must contain 3 to 4 digits only.');
const exhaustedNumberError = () => Object.assign(new Error('All 3 to 4 digit IAR numbers have been used. No number above 9999 can be assigned.'), { code: 'DOCUMENT_NUMBER_EXHAUSTED' });

const highestSavedSequence = async (Model, field, prefix, session) => {
  const pattern = numericIar(Model, field) ? /^[0-9]{3,4}$/ : new RegExp(`^${prefix}\\d+$`);
  const records = await Model.find({ [field]: pattern }).select(field).session(session).lean();
  // Include deleted records: a receipt number must never be reused.
  return records.reduce((highest, record) => Math.max(highest, Number(String(record[field]).slice(prefix.length)) || 0), 0);
};

const sequenceKey = (Model, field, prefix) => `${Model.collection.name}:${field}:${prefix || 'numeric'}`;
const formatNumber = (prefix, sequence) => `${prefix}${String(sequence).padStart(3, '0')}`;

// Previewing/opening a form does not consume a number.
const nextDocumentNumber = async (Model, field, date = new Date(), session = null) => {
  const prefix = numberPrefix(Model, field, date);
  const saved = await highestSavedSequence(Model, field, prefix, session);
  const counter = await DocumentSequence.findById(sequenceKey(Model, field, prefix)).session(session).lean();
  const next = Math.max(saved, counter?.sequence || 0) + 1;
  if (numericIar(Model, field) && next > 9999) throw exhaustedNumberError();
  return formatNumber(prefix, next);
};

// Allocate on save. The atomic update also handles previously entered manual numbers.
// Passing the document's transaction session rolls numbering back with the stock/form.
const reserveDocumentNumber = async (Model, field, date = new Date(), session = null) => {
  const prefix = numberPrefix(Model, field, date);
  const saved = await highestSavedSequence(Model, field, prefix, session);
  const bounded = numericIar(Model, field);
  const key = sequenceKey(Model, field, prefix);
  if (bounded) {
    const counter = await DocumentSequence.findById(key).session(session).lean();
    if (Math.max(saved, counter?.sequence || 0) >= 9999) throw exhaustedNumberError();
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const counter = await DocumentSequence.findOneAndUpdate(
        { _id: key, ...(bounded ? { sequence: { $lt: 9999 } } : {}) },
        [{ $set: { sequence: { $add: [{ $max: [{ $ifNull: ['$sequence', 0] }, saved] }, 1] } } }],
        { upsert: true, returnDocument: 'after', updatePipeline: true, session },
      );
      return formatNumber(prefix, counter.sequence);
    } catch (error) {
      // Two first saves can race to insert the counter. Retry the allocation,
      // or let withTransaction retry the whole transaction with a fresh snapshot.
      if (error.code !== 11000) throw error;
      if (session?.inTransaction()) {
        error.addErrorLabel('TransientTransactionError');
        throw error;
      }
      if (bounded && (await DocumentSequence.findById(key).lean())?.sequence >= 9999) throw exhaustedNumberError();
      if (attempt === 4) throw error;
    }
  }
};

// Manual IAR numbers share the same lifetime counter as automatic saves. Keep
// this update in the receipt's transaction so failed saves cannot consume it.
const recordManualIarNumber = async (number, session = null) => {
  if (!isValidIarNumber(number)) throw iarNumberError();
  const Model = require('../models/InspectionAcceptanceReport');
  const key = sequenceKey(Model, 'iarNumber', '');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await DocumentSequence.findOneAndUpdate(
        { _id: key },
        [{ $set: { sequence: { $max: [{ $ifNull: ['$sequence', 0] }, Number(number)] } } }],
        { upsert: true, returnDocument: 'after', updatePipeline: true, session },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (session?.inTransaction()) {
        error.addErrorLabel('TransientTransactionError');
        throw error;
      }
      if (attempt === 4) throw error;
    }
  }
};

module.exports = { nextDocumentNumber, reserveDocumentNumber, recordManualIarNumber, isValidIarNumber, iarNumberError };
