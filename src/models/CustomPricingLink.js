const mongoose = require('mongoose');
const crypto = require('crypto');

const customPricingLinkSchema = new mongoose.Schema(
  {
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    token: { type: String, required: true, unique: true, trim: true, index: true },
    custom_price: { type: Number, required: true, min: 0 },
    label: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    expires_at: { type: Date, default: null },
    usage_limit: { type: Number, min: 1, default: null },
    used_count: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

function generatePricingToken() {
  return crypto.randomBytes(16).toString('hex');
}

customPricingLinkSchema.statics.generateToken = generatePricingToken;

module.exports = mongoose.model('CustomPricingLink', customPricingLinkSchema);
module.exports.generatePricingToken = generatePricingToken;
