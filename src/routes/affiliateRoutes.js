const express = require('express');
const { body } = require('express-validator');
const { protect, requireRoles } = require('../middleware/auth');
const {
  getDashboard,
  getReferrals,
  getCommissionHistory,
  listMyWithdrawals,
  requestWithdrawal,
  validateReferralCode,
} = require('../controllers/affiliateController');

const router = express.Router();

router.get('/validate/:code', validateReferralCode);
router.get('/validate', validateReferralCode);

router.use(protect, requireRoles('student', 'admin'));

router.get('/dashboard', getDashboard);
router.get('/referrals', getReferrals);
router.get('/commissions', getCommissionHistory);
router.get('/withdrawals', listMyWithdrawals);
router.post(
  '/withdrawals',
  [
    body('amount').isFloat({ min: 0.01 }),
    body('method').trim().notEmpty(),
    body('account_details').optional().trim(),
  ],
  requestWithdrawal
);

module.exports = router;
