const mongoose = require('mongoose');

const ENROLLMENT_STATUSES = ['pending', 'pending_verification', 'approved', 'rejected', 'cancelled', 'completed'];
const ENROLLMENT_TYPES = ['manual', 'auto', 'approval_required'];

const enrollmentSchema = new mongoose.Schema(
  {
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    amount: { type: Number, min: 0, default: 0 },
    enrollment_type: { type: String, enum: ENROLLMENT_TYPES, default: 'auto', index: true },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'pending', index: true },
    notes: { type: String, default: '', trim: true },
    enrolled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    payment_proof_url: { type: String, default: '' },
    transaction_id: { type: String, default: '', trim: true },
    admin_note: { type: String, default: '' },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
    approved_at: { type: Date, default: null },
    /** WordPress migrations / manual grants: course access without instructor commission */
    exclude_from_teacher_earnings: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

enrollmentSchema.index({ student_id: 1, course_id: 1 }, { unique: true });

module.exports = {
  Enrollment: mongoose.model('Enrollment', enrollmentSchema),
  ENROLLMENT_STATUSES,
  ENROLLMENT_TYPES,
};
