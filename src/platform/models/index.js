const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

const enums = {
  roles: ['admin', 'teacher', 'editor', 'student'],
  contentStatus: ['draft', 'published', 'archived'],
  categoryStatus: ['active', 'inactive'],
  accessStatus: ['active', 'expired', 'refunded'],
  quizStatus: ['draft', 'published', 'archived'],
  questionType: ['mcq', 'truefalse', 'shortanswer'],
  assignmentStatus: ['draft', 'published', 'closed'],
  paymentStatus: ['pending', 'paid', 'failed', 'refunded'],
  earningStatus: ['pending', 'released'],
  completionType: ['full_completion', 'passed_exam'],
  notificationType: ['email', 'whatsapp', 'inapp'],
  notificationStatus: ['pending', 'sent', 'failed', 'read'],
  discountType: ['percent', 'fixed'],
  couponStatus: ['active', 'inactive', 'expired'],
  affiliateStatus: ['active', 'inactive', 'blocked'],
  subscriptionStatus: ['active', 'canceled', 'expired', 'pending'],
  billingCycle: ['monthly', 'quarterly', 'yearly'],
  qaStatus: ['open', 'answered', 'closed'],
  videoProvider: ['youtube', 'vimeo', 'upload'],
  courseLevel: ['beginner', 'intermediate', 'advanced', 'all-levels'],
};

const attachmentSchema = new Schema(
  {
    name: { type: String, trim: true },
    fileUrl: { type: String, trim: true },
    mimeType: { type: String, trim: true },
  },
  { _id: false }
);

// 1) User
const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: enums.roles, default: 'student', index: true },
    phone: { type: String, trim: true },
    profileImage: { type: String, trim: true },
    bio: { type: String, trim: true, maxlength: 2000 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);
userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
};
userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

// 2) Category
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    description: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: enums.categoryStatus, default: 'active', index: true },
  },
  { timestamps: true }
);

// 3) Course
const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 15000 },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    durationHours: { type: Number, required: true, min: 0 },
    thumbnail: { type: String, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    level: { type: String, enum: enums.courseLevel, default: 'all-levels' },
    language: { type: String, default: 'en', trim: true, maxlength: 30 },
    status: { type: String, enum: enums.contentStatus, default: 'draft', index: true },
    isSubscriptionIncluded: { type: Boolean, default: false, index: true },
    totalEnrollments: { type: Number, default: 0, min: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
  },
  { timestamps: true }
);
courseSchema.index({ teacherId: 1, status: 1, createdAt: -1 });
courseSchema.index({ categoryId: 1, status: 1, createdAt: -1 });
courseSchema.index({ title: 'text', description: 'text' });

// 4) CourseSection
const courseSectionSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    order: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);
courseSectionSchema.index({ courseId: 1, order: 1 }, { unique: true });

// 5) Lesson
const lessonSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'CourseSection', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 5000 },
    videoProvider: { type: String, enum: enums.videoProvider, required: true },
    videoUrl: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, default: 0, min: 0 },
    isPreview: { type: Boolean, default: false, index: true },
    order: { type: Number, default: 0, min: 0 },
    attachments: [attachmentSchema],
  },
  { timestamps: true }
);
lessonSchema.index({ courseId: 1, sectionId: 1, order: 1 }, { unique: true });

// 6) Enrollment
const enrollmentSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', index: true },
    enrolledAt: { type: Date, default: Date.now, index: true },
    accessStatus: { type: String, enum: enums.accessStatus, default: 'active', index: true },
    progressPercent: { type: Number, default: 0, min: 0, max: 100, index: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);
enrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

// 7) LessonProgress
const lessonProgressSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    isCompleted: { type: Boolean, default: false, index: true },
    watchedSeconds: { type: Number, default: 0, min: 0 },
    lastWatchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
lessonProgressSchema.index({ studentId: 1, lessonId: 1 }, { unique: true });
lessonProgressSchema.index({ courseId: 1, studentId: 1 });

// 8) Quiz
const quizSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'CourseSection', index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 2000 },
    passingScore: { type: Number, default: 60, min: 0, max: 100 },
    timeLimit: { type: Number, min: 0 },
    status: { type: String, enum: enums.quizStatus, default: 'draft', index: true },
  },
  { timestamps: true }
);

// 9) QuizQuestion
const quizQuestionSchema = new Schema(
  {
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    questionText: { type: String, required: true, trim: true, maxlength: 4000 },
    questionType: { type: String, enum: enums.questionType, required: true },
    options: [{ type: String, trim: true, maxlength: 500 }],
    correctAnswer: { type: Schema.Types.Mixed, required: true },
    marks: { type: Number, default: 1, min: 0 },
    order: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);
quizQuestionSchema.index({ quizId: 1, order: 1 }, { unique: true });

// 10) QuizAttempt
const quizAttemptSchema = new Schema(
  {
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    score: { type: Number, default: 0, min: 0 },
    passed: { type: Boolean, default: false, index: true },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);
quizAttemptSchema.index({ quizId: 1, studentId: 1, createdAt: -1 });

// 11) Assignment
const assignmentSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 6000 },
    dueDate: { type: Date, index: true },
    maxMarks: { type: Number, default: 100, min: 0 },
    status: { type: String, enum: enums.assignmentStatus, default: 'draft', index: true },
  },
  { timestamps: true }
);

// 12) AssignmentSubmission
const assignmentSubmissionSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fileUrl: { type: String, required: true, trim: true },
    submittedAt: { type: Date, default: Date.now },
    marks: { type: Number, min: 0 },
    feedback: { type: String, trim: true, maxlength: 4000 },
    status: { type: String, enum: ['submitted', 'graded', 'rejected'], default: 'submitted', index: true },
  },
  { timestamps: true }
);
assignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

// 13) Payment
const paymentSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', trim: true, maxlength: 12 },
    paymentMethod: { type: String, trim: true, required: true },
    provider: { type: String, trim: true, required: true },
    transactionId: { type: String, trim: true, unique: true, sparse: true, index: true },
    status: { type: String, enum: enums.paymentStatus, default: 'pending', index: true },
    paidAt: { type: Date },
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
    affiliateId: { type: Schema.Types.ObjectId, ref: 'Affiliate', index: true },
  },
  { timestamps: true }
);
paymentSchema.index({ studentId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, paidAt: -1 });

// 14) Invoice
const invoiceSchema = new Schema(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true, index: true },
    invoiceNumber: { type: String, required: true, trim: true, unique: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    issuedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// 15) Refund
const refundSchema = new Schema(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, required: true, trim: true, maxlength: 2500 },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['requested', 'approved', 'rejected', 'processed'], default: 'requested', index: true },
    requestedAt: { type: Date, default: Date.now, index: true },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

// 16) InstructorEarning
const instructorEarningSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true, index: true },
    grossAmount: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: enums.earningStatus, default: 'pending', index: true },
  },
  { timestamps: true }
);

// 17) Subscription
const subscriptionSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planName: { type: String, required: true, trim: true, maxlength: 120 },
    price: { type: Number, required: true, min: 0 },
    billingCycle: { type: String, enum: enums.billingCycle, required: true },
    status: { type: String, enum: enums.subscriptionStatus, default: 'active', index: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', index: true },
  },
  { timestamps: true }
);
subscriptionSchema.index({ studentId: 1, status: 1, endDate: -1 });

// 18) Certificate
const certificateSchema = new Schema(
  {
    certificateId: { type: String, required: true, trim: true, unique: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true, unique: true, index: true },
    issueDate: { type: Date, default: Date.now, index: true },
    completionType: { type: String, enum: enums.completionType, required: true },
    pdfUrl: { type: String, trim: true },
    verificationUrl: { type: String, trim: true },
    signatureName: { type: String, trim: true, maxlength: 180 },
    status: { type: String, enum: ['issued', 'revoked'], default: 'issued', index: true },
  },
  { timestamps: true }
);
certificateSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

// 19) Notification
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: enums.notificationType, required: true },
    title: { type: String, required: true, trim: true, maxlength: 250 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    relatedEntityType: { type: String, trim: true, maxlength: 120 },
    relatedEntityId: { type: Schema.Types.ObjectId },
    status: { type: String, enum: enums.notificationStatus, default: 'pending', index: true },
    sentAt: { type: Date },
  },
  { timestamps: true }
);
notificationSchema.index({ userId: 1, createdAt: -1 });

// 20) NotificationTemplate
const notificationTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, index: true },
    channel: { type: String, enum: enums.notificationType, required: true },
    subject: { type: String, trim: true, maxlength: 250 },
    body: { type: String, required: true, trim: true, maxlength: 8000 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// 21) Comment
const commentSchema = new Schema(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    comment: { type: String, required: true, trim: true, maxlength: 3000 },
    parentCommentId: { type: Schema.Types.ObjectId, ref: 'Comment', index: true },
  },
  { timestamps: true }
);
commentSchema.index({ lessonId: 1, createdAt: -1 });

// 22) QuestionAnswer
const questionAnswerSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    question: { type: String, required: true, trim: true, maxlength: 5000 },
    teacherReply: { type: String, trim: true, maxlength: 5000 },
    status: { type: String, enum: enums.qaStatus, default: 'open', index: true },
  },
  { timestamps: true }
);
questionAnswerSchema.index({ courseId: 1, createdAt: -1 });

// 23) PointsTransaction
const pointsTransactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    source: {
      type: String,
      enum: ['lesson_complete', 'quiz_pass', 'course_complete'],
      required: true,
      index: true,
    },
    points: { type: Number, required: true },
  },
  { timestamps: true }
);
pointsTransactionSchema.index({ userId: 1, createdAt: -1 });

// 24) Badge
const badgeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    icon: { type: String, trim: true },
    ruleType: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

// 25) UserBadge
const userBadgeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    badgeId: { type: Schema.Types.ObjectId, ref: 'Badge', required: true, index: true },
    awardedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);
userBadgeSchema.index({ userId: 1, badgeId: 1 }, { unique: true });

// 26) Coupon
const couponSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    discountType: { type: String, enum: enums.discountType, required: true },
    discountValue: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    usageLimit: { type: Number, default: 0, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: enums.couponStatus, default: 'active', index: true },
  },
  { timestamps: true }
);

// 27) Affiliate
const affiliateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    referralCode: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    commissionRate: { type: Number, required: true, min: 0, max: 100 },
    status: { type: String, enum: enums.affiliateStatus, default: 'active', index: true },
  },
  { timestamps: true }
);

// 28) AffiliateCommission (to support referral commissions)
const affiliateCommissionSchema = new Schema(
  {
    affiliateId: { type: Schema.Types.ObjectId, ref: 'Affiliate', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'approved', 'paid', 'rejected'], default: 'pending', index: true },
  },
  { timestamps: true }
);

// 29) AnalyticsDaily
const analyticsDailySchema = new Schema(
  {
    date: { type: Date, required: true, unique: true, index: true },
    totalSales: { type: Number, default: 0, min: 0 },
    totalOrders: { type: Number, default: 0, min: 0 },
    newStudents: { type: Number, default: 0, min: 0 },
    completedCourses: { type: Number, default: 0, min: 0 },
    activeUsers: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// 30) AnalyticsCourse
const analyticsCourseSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, unique: true, index: true },
    totalSales: { type: Number, default: 0, min: 0 },
    totalEnrollments: { type: Number, default: 0, min: 0 },
    completionRate: { type: Number, default: 0, min: 0, max: 100 },
    averageScore: { type: Number, default: 0, min: 0, max: 100 },
    updatedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);
const CourseSection = mongoose.models.CourseSection || mongoose.model('CourseSection', courseSectionSchema);
const Lesson = mongoose.models.Lesson || mongoose.model('Lesson', lessonSchema);
const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);
const LessonProgress = mongoose.models.LessonProgress || mongoose.model('LessonProgress', lessonProgressSchema);
const Quiz = mongoose.models.Quiz || mongoose.model('Quiz', quizSchema);
const QuizQuestion = mongoose.models.QuizQuestion || mongoose.model('QuizQuestion', quizQuestionSchema);
const QuizAttempt = mongoose.models.QuizAttempt || mongoose.model('QuizAttempt', quizAttemptSchema);
const Assignment = mongoose.models.Assignment || mongoose.model('Assignment', assignmentSchema);
const AssignmentSubmission =
  mongoose.models.AssignmentSubmission || mongoose.model('AssignmentSubmission', assignmentSubmissionSchema);
const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
const Refund = mongoose.models.Refund || mongoose.model('Refund', refundSchema);
const InstructorEarning = mongoose.models.InstructorEarning || mongoose.model('InstructorEarning', instructorEarningSchema);
const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
const Certificate = mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
const NotificationTemplate =
  mongoose.models.NotificationTemplate || mongoose.model('NotificationTemplate', notificationTemplateSchema);
const Comment = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
const QuestionAnswer = mongoose.models.QuestionAnswer || mongoose.model('QuestionAnswer', questionAnswerSchema);
const PointsTransaction = mongoose.models.PointsTransaction || mongoose.model('PointsTransaction', pointsTransactionSchema);
const Badge = mongoose.models.Badge || mongoose.model('Badge', badgeSchema);
const UserBadge = mongoose.models.UserBadge || mongoose.model('UserBadge', userBadgeSchema);
const Coupon = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
const Affiliate = mongoose.models.Affiliate || mongoose.model('Affiliate', affiliateSchema);
const AffiliateCommission =
  mongoose.models.AffiliateCommission || mongoose.model('AffiliateCommission', affiliateCommissionSchema);
const AnalyticsDaily = mongoose.models.AnalyticsDaily || mongoose.model('AnalyticsDaily', analyticsDailySchema);
const AnalyticsCourse = mongoose.models.AnalyticsCourse || mongoose.model('AnalyticsCourse', analyticsCourseSchema);

module.exports = {
  enums,
  User,
  Category,
  Course,
  CourseSection,
  Lesson,
  Enrollment,
  LessonProgress,
  Quiz,
  QuizQuestion,
  QuizAttempt,
  Assignment,
  AssignmentSubmission,
  Payment,
  Invoice,
  Refund,
  InstructorEarning,
  Subscription,
  Certificate,
  Notification,
  NotificationTemplate,
  Comment,
  QuestionAnswer,
  PointsTransaction,
  Badge,
  UserBadge,
  Coupon,
  Affiliate,
  AffiliateCommission,
  AnalyticsDaily,
  AnalyticsCourse,
};
