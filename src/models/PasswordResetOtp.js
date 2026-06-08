const mongoose = require('mongoose');

const passwordResetOtpSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channel: { type: String, enum: ['email', 'whatsapp'], required: true },
    identifier: { type: String, required: true, trim: true, index: true },
    code_hash: { type: String, required: true, select: false },
    reset_session_hash: { type: String, default: '', select: false },
    expires_at: { type: Date, required: true, index: true },
    verified_at: { type: Date, default: null },
    attempts: { type: Number, default: 0, min: 0 },
    max_attempts: { type: Number, default: 5, min: 1 },
  },
  { timestamps: true, collection: 'password_reset_otps' }
);

passwordResetOtpSchema.index({ user_id: 1, createdAt: -1 });
passwordResetOtpSchema.index({ identifier: 1, createdAt: -1 });

module.exports = mongoose.model('PasswordResetOtp', passwordResetOtpSchema);
