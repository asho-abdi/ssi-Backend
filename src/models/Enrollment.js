const mongoose = require('mongoose');

const ENROLLMENT_STATUSES = ['pending', 'pending_verification', 'approved', 'rejected'];

const enrollmentSchema = new mongoose.Schema(
  {
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    amount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'pending', index: true },
    payment_proof_url: { type: String, default: '' },
    transaction_id: { type: String, default: '', trim: true },
    admin_note: { type: String, default: '' },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
    approved_at: { type: Date, default: null },
  },
  { timestamps: true }
);

enrollmentSchema.index({ student_id: 1, course_id: 1 }, { unique: true });

module.exports = {
  Enrollment: mongoose.model('Enrollment', enrollmentSchema),
  ENROLLMENT_STATUSES,
};
