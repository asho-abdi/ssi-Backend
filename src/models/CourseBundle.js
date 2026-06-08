const mongoose = require('mongoose');

const BUNDLE_STATUSES = ['draft', 'active', 'inactive'];

const courseBundleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    image: { type: String, default: '', trim: true },
    course_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: BUNDLE_STATUSES, default: 'draft', index: true },
    sales_count: { type: Number, min: 0, default: 0 },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = {
  CourseBundle: mongoose.model('CourseBundle', courseBundleSchema),
  BUNDLE_STATUSES,
};
