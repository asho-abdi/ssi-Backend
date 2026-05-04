const express = require('express');
const { adminOverview, adminReport, adminInVideoQuizAnalytics } = require('../controllers/statsController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/admin', protect, requireRoles('admin'), adminOverview);
router.get('/admin/report', protect, requireRoles('admin'), adminReport);
router.get('/admin/in-video-quiz-analytics', protect, requireRoles('admin'), adminInVideoQuizAnalytics);

module.exports = router;
