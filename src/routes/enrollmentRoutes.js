const express = require('express');
const {
  enrollCourse,
  submitPaymentProof,
  reviewEnrollment,
  getMyEnrollments,
  getMyEnrollmentByCourse,
  listAllEnrollments,
  manualEnroll,
  cancelEnrollment,
  completeEnrollment,
} = require('../controllers/enrollmentController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', requireRoles('student', 'admin'), enrollCourse);
router.get('/mine', requireRoles('student', 'admin'), getMyEnrollments);
router.get('/course/:courseId/mine', requireRoles('student', 'admin'), getMyEnrollmentByCourse);
router.patch('/:id/payment-proof', requireRoles('student', 'admin'), submitPaymentProof);
router.get('/all', requireRoles('admin'), listAllEnrollments);
router.post('/manual', requireRoles('admin'), manualEnroll);
router.patch('/:id/review', requireRoles('admin'), reviewEnrollment);
router.patch('/:id/cancel', requireRoles('admin'), cancelEnrollment);
router.patch('/:id/complete', requireRoles('admin'), completeEnrollment);

module.exports = router;
