const express = require('express');
const { body } = require('express-validator');
const { protect, requireRoles } = require('../middleware/auth');
const {
  getSettings,
  updateSettings,
  getOverview,
  listCommissions,
  listWithdrawals,
  reviewWithdrawal,
  updateCourseAffiliatePercent,
  backfillReferralCodes,
} = require('../controllers/adminAffiliateController');

const router = express.Router();

router.use(protect, requireRoles('admin'));

router.get('/settings', getSettings);
router.patch(
  '/settings',
  [
    body('affiliate_program_enabled').optional().isBoolean(),
    body('affiliate_commission_percent').optional().isFloat({ min: 0, max: 100 }),
    body('affiliate_hold_days').optional().isFloat({ min: 0 }),
  ],
  updateSettings
);
router.get('/overview', getOverview);
router.get('/commissions', listCommissions);
router.get('/withdrawals', listWithdrawals);
router.patch('/withdrawals/:id', [body('action').trim().notEmpty()], reviewWithdrawal);
router.patch('/courses/:courseId/commission', updateCourseAffiliatePercent);
router.post('/backfill-referral-codes', backfillReferralCodes);

module.exports = router;
