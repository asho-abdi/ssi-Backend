const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  me,
  updateProfile,
  listTeachers,
  sendEmailVerification,
  verifyEmail,
  forgotPassword,
  verifyResetCode,
  resetPasswordWithCode,
  resetPassword,
} = require('../controllers/authController');
const { protect, requireRoles } = require('../middleware/auth');
const { passwordResetRateLimit } = require('../middleware/passwordResetRateLimit');
const { loginRateLimit } = require('../middleware/loginRateLimit');
const { registerLimiter } = require('../middleware/security');

const router = express.Router();

router.post(
  '/register',
  registerLimiter,
  [
    body('name').trim().notEmpty().isLength({ max: 120 }),
    body('username').trim().notEmpty().isLength({ min: 3, max: 40 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8, max: 128 }),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('referral_code').optional().trim().isLength({ max: 32 }),
  ],
  register
);
router.post(
  '/login',
  loginRateLimit,
  [
    body('login').trim().notEmpty().withMessage('Email or username is required').isLength({ max: 120 }),
    body('password').notEmpty().isLength({ max: 128 }),
  ],
  login
);
router.post(
  '/forgot-password',
  passwordResetRateLimit,
  [
    body('channel').optional().isIn(['email', 'whatsapp']),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().trim(),
  ],
  forgotPassword
);
router.post(
  '/verify-reset-code',
  passwordResetRateLimit,
  [
    body('channel').isIn(['email', 'whatsapp']),
    body('code').trim().notEmpty(),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().trim(),
  ],
  verifyResetCode
);
router.post(
  '/reset-password-with-code',
  passwordResetRateLimit,
  [body('reset_session_token').trim().notEmpty(), body('password').isLength({ min: 8, max: 128 })],
  resetPasswordWithCode
);
router.post(
  '/reset-password',
  passwordResetRateLimit,
  [body('token').trim().notEmpty(), body('password').isLength({ min: 8, max: 128 })],
  resetPassword
);
router.get('/verify-email', verifyEmail);
router.get('/me', protect, me);
router.post('/send-verification', protect, sendEmailVerification);
router.get('/teachers', protect, requireRoles('admin', 'editor'), listTeachers);
router.patch(
  '/profile',
  protect,
  [
    body('name').optional().trim(),
    body('email').optional().isEmail(),
    body('phone').optional().trim(),
    body('bio').optional().trim(),
    body('avatar_url').optional().trim(),
    body('avatarUrl').optional().trim(),
    body('social.facebook').optional().trim(),
    body('social.linkedin').optional().trim(),
    body('social.website').optional().trim(),
    body('instructor_settings.public_profile').optional().isBoolean(),
    body('instructor_settings.notifications').optional().isBoolean(),
  ],
  updateProfile
);

module.exports = router;
