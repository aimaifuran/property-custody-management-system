// Document types have separate monthly sequences. Existing/manual numbers stay intact.
const nextDocumentNumber = async (Model, field, date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(date);
  const year = parts.find(part => part.type === 'year').value;
  const month = parts.find(part => part.type === 'month').value;
  const prefix = `${year}-${month}-`;
  const records = await Model.find({ [field]: new RegExp(`^${prefix}\\d+$`) }).select(field).lean();
  const sequence = records.reduce((highest, record) => Math.max(highest, Number(String(record[field]).slice(prefix.length)) || 0), 0) + 1;
  return `${prefix}${String(sequence).padStart(3, '0')}`;
};
module.exports = { nextDocumentNumber };
