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

const router = express.Router();

router.post(
  '/register',
  [
    body('name').trim().notEmpty(),
    body('username').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('referral_code').optional().trim(),
  ],
  register
);
router.post(
  '/login',
  [
    body('login').trim().notEmpty().withMessage('Email or username is required'),
    body('password').notEmpty(),
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
  [body('reset_session_token').trim().notEmpty(), body('password').isLength({ min: 6 })],
  resetPasswordWithCode
);
router.post('/reset-password', [body('token').trim().notEmpty(), body('password').isLength({ min: 6 })], resetPassword);
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
