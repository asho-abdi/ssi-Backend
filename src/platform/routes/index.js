const express = require('express');
const authRoutes = require('./authRoutes');
const { createResourceRouter } = require('./resourceRouterFactory');
const { authorize } = require('../middleware/rbac');
const { authenticate } = require('../middleware/auth');
const { listDaily, listCourses } = require('../controllers/analyticsController');
const models = require('../models');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', createResourceRouter(models.User, { writeRoles: ['admin'] }));
router.use('/categories', createResourceRouter(models.Category));
router.use('/courses', createResourceRouter(models.Course));
router.use('/course-sections', createResourceRouter(models.CourseSection));
router.use('/lessons', createResourceRouter(models.Lesson));
router.use('/enrollments', createResourceRouter(models.Enrollment, { writeRoles: ['admin', 'teacher'] }));
router.use('/lesson-progress', createResourceRouter(models.LessonProgress, { writeRoles: ['admin', 'teacher', 'student'] }));
router.use('/quizzes', createResourceRouter(models.Quiz));
router.use('/quiz-questions', createResourceRouter(models.QuizQuestion));
router.use('/quiz-attempts', createResourceRouter(models.QuizAttempt, { writeRoles: ['admin', 'teacher', 'student'] }));
router.use('/assignments', createResourceRouter(models.Assignment));
router.use('/assignment-submissions', createResourceRouter(models.AssignmentSubmission, { writeRoles: ['admin', 'teacher', 'student'] }));
router.use('/payments', createResourceRouter(models.Payment, { writeRoles: ['admin', 'student'] }));
router.use('/invoices', createResourceRouter(models.Invoice, { writeRoles: ['admin'] }));
router.use('/refunds', createResourceRouter(models.Refund, { writeRoles: ['admin', 'student'] }));
router.use('/instructor-earnings', createResourceRouter(models.InstructorEarning, { writeRoles: ['admin'] }));
router.use('/subscriptions', createResourceRouter(models.Subscription, { writeRoles: ['admin', 'student'] }));
router.use('/certificates', createResourceRouter(models.Certificate, { writeRoles: ['admin', 'teacher'] }));
router.use('/notifications', createResourceRouter(models.Notification, { writeRoles: ['admin'] }));
router.use('/notification-templates', createResourceRouter(models.NotificationTemplate, { writeRoles: ['admin'] }));
router.use('/comments', createResourceRouter(models.Comment, { writeRoles: ['admin', 'teacher', 'editor', 'student'] }));
router.use('/questions-answers', createResourceRouter(models.QuestionAnswer, { writeRoles: ['admin', 'teacher', 'student'] }));
router.use('/points-transactions', createResourceRouter(models.PointsTransaction, { writeRoles: ['admin'] }));
router.use('/badges', createResourceRouter(models.Badge, { writeRoles: ['admin'] }));
router.use('/user-badges', createResourceRouter(models.UserBadge, { writeRoles: ['admin'] }));
router.use('/coupons', createResourceRouter(models.Coupon, { writeRoles: ['admin', 'editor'] }));
router.use('/affiliates', createResourceRouter(models.Affiliate, { writeRoles: ['admin'] }));
router.use('/affiliate-commissions', createResourceRouter(models.AffiliateCommission, { writeRoles: ['admin'] }));
router.use('/analytics-daily', createResourceRouter(models.AnalyticsDaily, { writeRoles: ['admin'] }));
router.use('/analytics-courses', createResourceRouter(models.AnalyticsCourse, { writeRoles: ['admin'] }));

router.get('/reports/analytics/daily', authenticate, authorize('admin'), listDaily);
router.get('/reports/analytics/courses', authenticate, authorize('admin'), listCourses);

module.exports = router;
