const express = require('express');
const {
  overview,
  listCoursePricing,
  updateCoursePricing,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  listWithdrawals,
  myWithdrawals,
  createWithdrawal,
  reviewWithdrawal,
  markOrderPaid,
} = require('../controllers/monetizationController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/overview', requireRoles('admin'), overview);

router.get('/course-pricing', requireRoles('admin'), listCoursePricing);
router.patch('/course-pricing/:id', requireRoles('admin'), updateCoursePricing);

router.get('/coupons', requireRoles('admin'), listCoupons);
router.post('/coupons', requireRoles('admin'), createCoupon);
router.patch('/coupons/:id', requireRoles('admin'), updateCoupon);
router.delete('/coupons/:id', requireRoles('admin'), deleteCoupon);

router.get('/subscriptions', requireRoles('admin'), listPlans);
router.post('/subscriptions', requireRoles('admin'), createPlan);
router.patch('/subscriptions/:id', requireRoles('admin'), updatePlan);
router.delete('/subscriptions/:id', requireRoles('admin'), deletePlan);

router.get('/withdrawals', requireRoles('admin'), listWithdrawals);
router.get('/withdrawals/me', requireRoles('teacher'), myWithdrawals);
router.post('/withdrawals', requireRoles('teacher'), createWithdrawal);
router.patch('/withdrawals/:id/review', requireRoles('admin'), reviewWithdrawal);

router.patch('/orders/:id/mark-paid', requireRoles('admin'), markOrderPaid);

module.exports = router;
