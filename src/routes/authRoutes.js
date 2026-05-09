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
  resetPassword,
} = require('../controllers/authController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/register',
  [
    body('name').trim().notEmpty(),
    body('username').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  register
);
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  login
);
router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], forgotPassword);
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
    body('avatar_file_id').optional().trim(),
    body('social.facebook').optional().trim(),
    body('social.linkedin').optional().trim(),
    body('social.website').optional().trim(),
    body('instructor_settings.public_profile').optional().isBoolean(),
    body('instructor_settings.notifications').optional().isBoolean(),
  ],
  updateProfile
);

module.exports = router;
