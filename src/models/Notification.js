const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    link: { type: String, default: '', trim: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    is_read: { type: Boolean, default: false, index: true },
    read_at: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
