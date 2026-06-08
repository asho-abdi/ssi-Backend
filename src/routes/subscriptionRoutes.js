const express = require('express');
const {
  listPlansPublic,
  mySubscriptions,
  subscribe,
  cancelSubscription,
  listSubscriptionsAdmin,
  subscriptionAnalytics,
} = require('../controllers/subscriptionController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/plans', listPlansPublic);

router.use(protect);

router.get('/mine', requireRoles('student', 'admin'), mySubscriptions);
router.post('/subscribe', requireRoles('student', 'admin'), subscribe);
router.post('/:id/cancel', requireRoles('student', 'admin'), cancelSubscription);

router.get('/admin/list', requireRoles('admin'), listSubscriptionsAdmin);
router.get('/admin/analytics', requireRoles('admin'), subscriptionAnalytics);

module.exports = router;
