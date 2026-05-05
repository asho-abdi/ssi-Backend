const express = require('express');
const { getProgress, updateProgress, submitInVideoQuizAttempt } = require('../controllers/progressController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/course/:courseId', protect, requireRoles('student', 'admin', 'teacher'), getProgress);
router.put('/course/:courseId', protect, requireRoles('student', 'admin', 'teacher'), updateProgress);
router.post('/course/:courseId/in-video-quiz', protect, requireRoles('student', 'admin', 'teacher'), submitInVideoQuizAttempt);

module.exports = router;
