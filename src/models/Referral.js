const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema(
  {
    referrer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referred_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    referral_code_used: { type: String, required: true, trim: true, uppercase: true },
    status: {
      type: String,
      enum: ['registered', 'converted'],
      default: 'registered',
      index: true,
    },
    registered_at: { type: Date, default: Date.now },
    first_purchase_at: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Referral', referralSchema);
