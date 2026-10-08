const mongoose = require('mongoose');

// One counter per document collection, number field, and Manila calendar month.
// IAR uses one lifetime numeric counter because its number has no date prefix.
const documentSequenceSchema = new mongoose.Schema({
  _id: { type: String },
  sequence: { type: Number, required: true },
}, { versionKey: false });

module.exports = mongoose.model('DocumentSequence', documentSequenceSchema);
