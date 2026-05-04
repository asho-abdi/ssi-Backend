const express = require('express');
const { protect, requireRoles } = require('../middleware/auth');
const { listMyNotifications, markRead, markAllRead } = require('../controllers/notificationController');

const router = express.Router();

router.get('/', protect, requireRoles('admin', 'teacher', 'editor', 'student'), listMyNotifications);
router.patch('/:id/read', protect, requireRoles('admin', 'teacher', 'editor', 'student'), markRead);
router.post('/read-all', protect, requireRoles('admin', 'teacher', 'editor', 'student'), markAllRead);

module.exports = router;
