const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 150 },
  office: { type: String, required: true, trim: true, maxlength: 150 },
  designation: { type: String, trim: true, maxlength: 150 },
  notes: { type: String, trim: true, maxlength: 1000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });
module.exports = mongoose.model('OfflineRecipient', schema);
