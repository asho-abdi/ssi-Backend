const mongoose = require('mongoose');

const courseAnnouncementSchema = new mongoose.Schema(
  {
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    is_active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

courseAnnouncementSchema.index({ course_id: 1, is_active: 1, createdAt: -1 });

module.exports = mongoose.model('CourseAnnouncement', courseAnnouncementSchema);
