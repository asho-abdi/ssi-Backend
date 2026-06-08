const mongoose = require('mongoose');

const SUBSCRIPTION_STATUSES = ['active', 'expired', 'cancelled', 'pending'];

const userSubscriptionSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true, index: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'pending', index: true },
    starts_at: { type: Date, default: null },
    expires_at: { type: Date, default: null, index: true },
    renewal_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    payment_method: { type: String, default: '', trim: true },
    amount_paid: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

module.exports = {
  UserSubscription: mongoose.model('UserSubscription', userSubscriptionSchema),
  SUBSCRIPTION_STATUSES,
};
