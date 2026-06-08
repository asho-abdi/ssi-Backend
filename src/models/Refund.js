const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema(
  {
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    enrollment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    amount:  { type: Number, default: 0, min: 0 },
    reason:  { type: String, required: true, trim: true },
    status:  { type: String, enum: ['pending', 'approved', 'rejected', 'refunded'], default: 'pending' },
    admin_note: { type: String, default: '', trim: true },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Refund', refundSchema);
