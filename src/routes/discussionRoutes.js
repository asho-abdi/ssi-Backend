const express = require('express');
const { protect, requireRoles } = require('../middleware/auth');
const {
  listCourseDiscussions,
  createDiscussionThread,
  replyDiscussionThread,
  toggleResolveDiscussionThread,
  listCourseAnnouncements,
  createCourseAnnouncement,
} = require('../controllers/discussionController');

const router = express.Router();

router.get('/course/:courseId', protect, requireRoles('admin', 'teacher', 'editor', 'student'), listCourseDiscussions);
router.post('/course/:courseId', protect, requireRoles('admin', 'teacher', 'editor', 'student'), createDiscussionThread);
router.post('/:threadId/replies', protect, requireRoles('admin', 'teacher', 'editor', 'student'), replyDiscussionThread);
router.patch('/:threadId/resolve', protect, requireRoles('admin', 'teacher'), toggleResolveDiscussionThread);

router.get('/course/:courseId/announcements', protect, requireRoles('admin', 'teacher', 'editor', 'student'), listCourseAnnouncements);
router.post('/course/:courseId/announcements', protect, requireRoles('admin', 'teacher'), createCourseAnnouncement);

module.exports = router;
