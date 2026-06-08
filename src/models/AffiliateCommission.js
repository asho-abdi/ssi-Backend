const mongoose = require('mongoose');

const affiliateCommissionSchema = new mongoose.Schema(
  {
    referrer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referred_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    purchase_amount: { type: Number, required: true, min: 0 },
    commission_percent: { type: Number, required: true, min: 0, max: 100 },
    commission_amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'available', 'paid', 'cancelled'],
      default: 'pending',
      index: true,
    },
    available_at: { type: Date, default: null },
    withdrawal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AffiliateWithdrawal', default: null },
    paid_at: { type: Date, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

affiliateCommissionSchema.index({ referrer_id: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('AffiliateCommission', affiliateCommissionSchema);
