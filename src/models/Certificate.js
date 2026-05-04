const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    /** Snapshot at issue time so PDFs stay correct if the Course is renamed or removed */
    course_title: { type: String, default: '', trim: true },
    serial_number: { type: Number, min: 1, default: null },
    issue_date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

certificateSchema.index({ user_id: 1, course_id: 1 }, { unique: true });
certificateSchema.index({ serial_number: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Certificate', certificateSchema);
