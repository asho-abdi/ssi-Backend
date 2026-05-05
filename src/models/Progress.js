const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    progress_percentage: { type: Number, default: 0, min: 0, max: 100 },
    completed_lesson_ids: [{ type: mongoose.Schema.Types.ObjectId }],
    in_video_quiz_attempts: [
      new mongoose.Schema(
        {
          quiz_id: { type: mongoose.Schema.Types.ObjectId, required: true },
          topic_id: { type: mongoose.Schema.Types.ObjectId, default: null },
          lesson_id: { type: mongoose.Schema.Types.ObjectId, default: null },
          selected_option_index: { type: Number, default: null },
          is_correct: { type: Boolean, default: null },
          status: { type: String, enum: ['correct', 'incorrect', 'skipped'], required: true },
          attempted_at: { type: Date, default: Date.now },
          can_repeat: { type: Boolean, default: false },
          attempt_number: { type: Number, min: 1, default: 1 },
          retry_policy_snapshot: { type: String, default: 'retry_on_skip' },
          max_attempts_snapshot: { type: Number, min: 1, default: 2 },
          retry_cooldown_seconds_snapshot: { type: Number, min: 0, default: 0 },
          next_retry_at: { type: Date, default: null },
        },
        { _id: false }
      ),
    ],
  },
  { timestamps: true }
);

progressSchema.index({ user_id: 1, course_id: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);
