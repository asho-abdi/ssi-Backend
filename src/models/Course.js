const mongoose = require('mongoose');
const DIFFICULTY_LEVELS = ['all', 'beginner', 'intermediate', 'expert'];

const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    video_url: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const assignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    due_date: { type: Date },
    points: { type: Number, default: 100, min: 0 },
  },
  { _id: true }
);

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    file_type: { type: String, enum: ['pdf', 'ppt', 'excel', 'zip', 'other'], default: 'other' },
    size_bytes: { type: Number, default: 0, min: 0 },
    storage_path: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const QUIZ_QUESTION_TYPES = ['circle_right_answer', 'true_false', 'fill_blank', 'short_answer'];

const quizQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    question_type: { type: String, enum: QUIZ_QUESTION_TYPES, default: 'circle_right_answer' },
    options: [{ type: String, trim: true }],
    answer_index: { type: Number, default: 0, min: 0 },
    answer_text: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    time_limit_minutes: { type: Number, min: 0 },
    questions: [quizQuestionSchema],
  },
  { _id: true }
);

const courseTopicSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    lessons: [lessonSchema],
    assignments: [assignmentSchema],
    quizzes: [quizSchema],
    in_video_quizzes: [
      new mongoose.Schema(
        {
          question: { type: String, required: true, trim: true },
          options: [{ type: String, trim: true }],
          correct_answer_index: { type: Number, min: 0, default: 0 },
          explanation: { type: String, default: '', trim: true },
          timestamp_seconds: { type: Number, min: 0, required: true },
          lesson_id: { type: mongoose.Schema.Types.ObjectId, default: null },
          lesson_order: { type: Number, min: 0, default: null },
          repeat_on_skip: { type: Boolean, default: false },
          retry_policy: {
            type: String,
            enum: ['no_retry', 'retry_on_skip', 'retry_on_incorrect', 'retry_always'],
            default: 'retry_on_skip',
          },
          max_attempts: { type: Number, min: 1, max: 10, default: 2 },
          retry_cooldown_seconds: { type: Number, min: 0, max: 86400, default: 0 },
          topic_id: { type: mongoose.Schema.Types.ObjectId, default: null },
          course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
        },
        { _id: true }
      ),
    ],
    resources: [resourceSchema],
  },
  { _id: true }
);

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    pricing_type: { type: String, enum: ['free', 'paid'], default: 'paid' },
    is_premium: { type: Boolean, default: true },
    price: { type: Number, required: true, min: 0 },
    sale_price: { type: Number, default: 0, min: 0 },
    difficulty_level: { type: String, enum: DIFFICULTY_LEVELS, default: 'all' },
    duration: { type: Number, required: true, min: 0 },
    thumbnail: { type: String, default: '' },
    video_url: { type: String, default: '' },
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lessons: [lessonSchema],
    assignments: [assignmentSchema],
    quizzes: [quizSchema],
    course_topics: [courseTopicSchema],
    all_resources: [resourceSchema],
    topic_resources: [
      new mongoose.Schema(
        {
          topic_index: { type: Number, min: 0, default: 0 },
          topic_title: { type: String, default: '', trim: true },
          resources: [resourceSchema],
        },
        { _id: false }
      ),
    ],
  },
  { timestamps: true }
);

courseSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Course', courseSchema);
