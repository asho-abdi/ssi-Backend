const mongoose = require('mongoose');

const discussionReplySchema = new mongoose.Schema(
  {
    author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, trim: true, maxlength: 3000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: true }
);

const discussionThreadSchema = new mongoose.Schema(
  {
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    lesson_id: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    question: { type: String, required: true, trim: true, maxlength: 4000 },
    is_resolved: { type: Boolean, default: false, index: true },
    replies: [discussionReplySchema],
  },
  { timestamps: true }
);

discussionThreadSchema.index({ course_id: 1, createdAt: -1 });

module.exports = mongoose.model('CourseDiscussionThread', discussionThreadSchema);
