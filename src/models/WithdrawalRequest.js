const mongoose = require('mongoose');

const withdrawalRequestSchema = new mongoose.Schema(
  {
    instructor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ['manual', 'bank_transfer', 'paypal', 'e_check'], required: true },
    account_details: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    note: { type: String, default: '' },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
