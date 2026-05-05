const mongoose = require('mongoose');

const AUDIENCE_ROLES = ['admin', 'teacher', 'editor', 'student'];

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    audience_roles: {
      type: [{ type: String, enum: AUDIENCE_ROLES }],
      default: AUDIENCE_ROLES,
    },
    starts_at: { type: Date, default: Date.now },
    ends_at: { type: Date, default: null },
    is_active: { type: Boolean, default: true, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

announcementSchema.index({ is_active: 1, starts_at: -1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
module.exports.AUDIENCE_ROLES = AUDIENCE_ROLES;
