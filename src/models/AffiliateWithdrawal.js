const mongoose = require('mongoose');

const affiliateWithdrawalSchema = new mongoose.Schema(
  {
    affiliate_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ['manual', 'bank_transfer', 'paypal', 'e_check', 'evc_plus', 'zaad', 'sahal'], required: true },
    account_details: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'paid'],
      default: 'pending',
      index: true,
    },
    note: { type: String, default: '' },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
    paid_at: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AffiliateWithdrawal', affiliateWithdrawalSchema);
