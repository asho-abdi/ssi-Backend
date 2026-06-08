const express = require('express');
const { protect, requireRoles } = require('../middleware/auth');
const {
  createOfflineEnrollment,
  getOfflineEnrollments,
  updateOfflineEnrollment,
} = require('../controllers/offlineEnrollmentController');

const router = express.Router();

// Public: anyone can submit a registration form
router.post('/', createOfflineEnrollment);

// Admin only
router.get('/', protect, requireRoles('admin'), getOfflineEnrollments);
router.put('/:id', protect, requireRoles('admin'), updateOfflineEnrollment);

module.exports = router;
