const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email:    { type: String, required: true, trim: true, lowercase: true },
    phone:    { type: String, default: '', trim: true },
    subject:  { type: String, required: true, trim: true },
    message:  { type: String, required: true, trim: true },
    read:     { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contact', contactSchema);
