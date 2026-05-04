const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discount_type: { type: String, enum: ['percentage', 'fixed'], required: true },
    discount_value: { type: Number, required: true, min: 0 },
    expires_at: { type: Date, default: null },
    usage_limit: { type: Number, min: 1, default: 1 },
    used_count: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);
