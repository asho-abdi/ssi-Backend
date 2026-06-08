const express = require('express');
const {
  enrollmentReport,
  paymentReport,
  exportEnrollmentReportPdf,
  exportPaymentReportPdf,
} = require('../controllers/reportController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect, requireRoles('admin'));

router.get('/enrollments', enrollmentReport);
router.get('/enrollments/export', exportEnrollmentReportPdf);
router.get('/payments', paymentReport);
router.get('/payments/export', exportPaymentReportPdf);

module.exports = router;
