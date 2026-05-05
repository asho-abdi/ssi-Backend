const express = require('express');
const { protect, requireRoles } = require('../middleware/auth');
const {
  listVisible,
  listAllAdmin,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} = require('../controllers/announcementController');

const router = express.Router();

router.get('/', protect, requireRoles('admin', 'teacher', 'editor', 'student'), listVisible);
router.get('/admin', protect, requireRoles('admin'), listAllAdmin);
router.post('/admin', protect, requireRoles('admin'), createAnnouncement);
router.patch('/admin/:id', protect, requireRoles('admin'), updateAnnouncement);
router.delete('/admin/:id', protect, requireRoles('admin'), deleteAnnouncement);

module.exports = router;
