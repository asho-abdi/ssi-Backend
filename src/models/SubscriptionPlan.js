const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    billing_cycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    price: { type: Number, required: true, min: 0 },
    access_scope: { type: String, enum: ['all_courses', 'selected_courses'], default: 'all_courses' },
    course_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
