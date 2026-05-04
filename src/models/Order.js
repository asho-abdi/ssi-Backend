const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    instructor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    original_amount: { type: Number, required: true, min: 0, default: 0 },
    discount_amount: { type: Number, min: 0, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    instructor_percentage: { type: Number, min: 0, max: 100, default: null },
    instructor_earning: { type: Number, min: 0, default: 0 },
    admin_earning: { type: Number, min: 0, default: 0 },
    coupon_code: { type: String, default: '', trim: true, uppercase: true },
    status: { type: String, enum: ['unpaid', 'pending', 'paid', 'failed'], default: 'unpaid' },
    payment_provider: { type: String, default: '' },
    payment_method: { type: String, default: '' },
    payment_intent_id: { type: String, default: '' },
    payment_status_detail: { type: String, default: '' },
    paid_at: { type: Date },
  },
  { timestamps: true }
);

orderSchema.index({ user_id: 1, course_id: 1 }, { unique: true });

module.exports = mongoose.model('Order', orderSchema);
