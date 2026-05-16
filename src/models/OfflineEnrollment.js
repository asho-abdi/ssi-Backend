const mongoose = require('mongoose');

const offlineEnrollmentSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    courseTitle: { type: String, default: '', trim: true },
    price: { type: Number, default: 0, min: 0 },
    schedule: { type: String, default: '', trim: true },
    paymentMethod: {
      type: String,
      enum: ['evc_plus', 'sahal', 'zaad', 'cash', 'bank_transfer'],
      default: 'cash',
    },
    notes: { type: String, default: '', trim: true },
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    status: { type: String, enum: ['registered', 'attended', 'cancelled'], default: 'registered' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OfflineEnrollment', offlineEnrollmentSchema);
