const mongoose = require('mongoose');

const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected', 'attended', 'absent'];

const eventRegistrationSchema = new mongoose.Schema(
  {
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    country: { type: String, default: '', trim: true },
    organization: { type: String, default: '', trim: true },
    status: { type: String, enum: REGISTRATION_STATUSES, default: 'pending' },
    /** Base64 PNG data URL — generated when status moves to approved */
    qr_code: { type: String, default: '' },
    check_in_time: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

eventRegistrationSchema.index({ event_id: 1, email: 1 }, { unique: true });
eventRegistrationSchema.index({ status: 1 });

module.exports = mongoose.model('EventRegistration', eventRegistrationSchema);
