const express = require('express');
const router = express.Router();
const { protect, requireRoles } = require('../middleware/auth');
const {
  requestRefund,
  getMyRefunds,
  getAllRefunds,
  updateRefund,
  getRefundStats,
} = require('../controllers/refundController');

router.post('/', protect, requireRoles('student'), requestRefund);
router.get('/mine', protect, requireRoles('student'), getMyRefunds);
router.get('/', protect, requireRoles('admin'), getAllRefunds);
router.get('/stats', protect, requireRoles('admin'), getRefundStats);
router.patch('/:id', protect, requireRoles('admin'), updateRefund);

module.exports = router;
