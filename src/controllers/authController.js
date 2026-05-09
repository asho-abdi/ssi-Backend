const { validationResult } = require('express-validator');
const crypto = require('crypto');
const User = require('../models/User');
const { signToken } = require('../utils/jwt');
const { normalizePermissions } = require('../utils/permissions');
const { logAuditEvent } = require('../utils/auditLog');
const { getPrimaryClientUrl } = require('../config/clientUrl');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
}

function issueRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function buildDevUrl(pathname, token) {
  const base = getPrimaryClientUrl().replace(/\/+$/, '');
  return `${base}${pathname}?token=${encodeURIComponent(token)}`;
}

function attachVerificationToken(user) {
  const rawToken = issueRawToken();
  user.email_verification_token_hash = hashToken(rawToken);
  user.email_verification_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return rawToken;
}

function attachResetToken(user) {
  const rawToken = issueRawToken();
  user.password_reset_token_hash = hashToken(rawToken);
  user.password_reset_expires_at = new Date(Date.now() + 60 * 60 * 1000);
  return rawToken;
}

function toAuthUserPayload(user) {
  const effectivePermissions = normalizePermissions(user.permissions, user.role);
  return {
    _id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    email_verified: Boolean(user.email_verified),
    role: user.role,
    permissions: effectivePermissions,
  };
}

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }
  const { name, username, email, password, role } = req.body;
  const allowedRegisterRoles = ['student'];
  const finalRole = allowedRegisterRoles.includes(role) ? role : 'student';
  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(400).json({ message: 'Email already registered' });
  }
  const usernameValue = String(username || '')
    .trim()
    .toLowerCase();
  const usernameExists = await User.findOne({ username: usernameValue });
  if (usernameExists) {
    return res.status(400).json({ message: 'Username already taken' });
  }
  const user = new User({ name, username: usernameValue, email, password, role: finalRole, email_verified: false });
  const rawVerificationToken = attachVerificationToken(user);
  await user.save();
  const token = signToken(user);
  await logAuditEvent(req, {
    actor_id: user._id,
    actor_role: user.role,
    action: 'auth.register',
    target_type: 'user',
    target_id: user._id,
    details: { email: user.email },
  });
  res.status(201).json({
    token,
    verification_required: true,
    verification: {
      message: 'Please verify your email address.',
      ...(process.env.NODE_ENV !== 'production'
        ? { dev_verify_url: buildDevUrl('/verify-email', rawVerificationToken) }
        : {}),
    },
    user: toAuthUserPayload(user),
  });
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    await logAuditEvent(req, {
      actor_role: 'anonymous',
      action: 'auth.login',
      status: 'failed',
      target_type: 'user',
      details: { email },
    });
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  const token = signToken(user);
  await logAuditEvent(req, {
    actor_id: user._id,
    actor_role: user.role,
    action: 'auth.login',
    target_type: 'user',
    target_id: user._id,
  });
  res.json({
    token,
    user: toAuthUserPayload(user),
  });
}

async function me(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const payload = user.toObject();
  payload.permissions = normalizePermissions(payload.permissions, payload.role);
  res.json(payload);
}

async function sendEmailVerification(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.email_verified) {
    return res.json({ message: 'Email is already verified' });
  }
  const rawToken = attachVerificationToken(user);
  await user.save();
  await logAuditEvent(req, {
    actor_id: user._id,
    actor_role: user.role,
    action: 'auth.send_email_verification',
    target_type: 'user',
    target_id: user._id,
  });
  res.json({
    message: 'Verification link generated',
    ...(process.env.NODE_ENV !== 'production' ? { dev_verify_url: buildDevUrl('/verify-email', rawToken) } : {}),
  });
}

async function verifyEmail(req, res) {
  const rawToken = String(req.query.token || '').trim();
  if (!rawToken) return res.status(400).json({ message: 'Verification token is required' });
  const hashed = hashToken(rawToken);
  const user = await User.findOne({
    email_verification_token_hash: hashed,
    email_verification_expires_at: { $gt: new Date() },
  });
  if (!user) {
    return res.status(400).json({ message: 'Verification token is invalid or expired' });
  }
  user.email_verified = true;
  user.email_verification_token_hash = '';
  user.email_verification_expires_at = null;
  await user.save();
  await logAuditEvent(req, {
    actor_id: user._id,
    actor_role: user.role,
    action: 'auth.verify_email',
    target_type: 'user',
    target_id: user._id,
  });
  res.json({ message: 'Email verified successfully' });
}

async function forgotPassword(req, res) {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const user = await User.findOne({ email });
  if (!user) {
    return res.json({ message: 'If that email exists, a reset link has been generated' });
  }
  const rawToken = attachResetToken(user);
  await user.save();
  await logAuditEvent(req, {
    actor_id: user._id,
    actor_role: user.role,
    action: 'auth.forgot_password',
    target_type: 'user',
    target_id: user._id,
  });
  res.json({
    message: 'If that email exists, a reset link has been generated',
    ...(process.env.NODE_ENV !== 'production' ? { dev_reset_url: buildDevUrl('/reset-password', rawToken) } : {}),
  });
}

async function resetPassword(req, res) {
  const rawToken = String(req.body?.token || '').trim();
  const nextPassword = String(req.body?.password || '');
  if (!rawToken) return res.status(400).json({ message: 'Reset token is required' });
  if (nextPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  const user = await User.findOne({
    password_reset_token_hash: hashToken(rawToken),
    password_reset_expires_at: { $gt: new Date() },
  }).select('+password');
  if (!user) return res.status(400).json({ message: 'Reset token is invalid or expired' });
  user.password = nextPassword;
  user.password_reset_token_hash = '';
  user.password_reset_expires_at = null;
  await user.save();
  await logAuditEvent(req, {
    actor_id: user._id,
    actor_role: user.role,
    action: 'auth.reset_password',
    target_type: 'user',
    target_id: user._id,
  });
  res.json({ message: 'Password reset successful' });
}

async function updateProfile(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }
  const { name, email, phone, bio, avatar_url, avatarUrl, social, instructor_settings } = req.body;
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (email && email !== user.email) {
    const taken = await User.findOne({ email });
    if (taken) return res.status(400).json({ message: 'Email in use' });
    user.email = email;
    user.email_verified = false;
    attachVerificationToken(user);
  }
  if (name) user.name = name;
  if (phone != null) user.phone = String(phone || '').trim();
  if (bio != null) user.bio = String(bio || '').trim();
  const nextAvatar = avatar_url != null ? avatar_url : avatarUrl;
  if (nextAvatar != null) user.avatar_url = String(nextAvatar || '').trim();
  if (social && typeof social === 'object') {
    user.social = {
      facebook: String(social.facebook || user.social?.facebook || '').trim(),
      linkedin: String(social.linkedin || user.social?.linkedin || '').trim(),
      website: String(social.website || user.social?.website || '').trim(),
    };
  }
  if (instructor_settings && typeof instructor_settings === 'object') {
    user.instructor_settings = {
      public_profile:
        instructor_settings.public_profile != null
          ? Boolean(instructor_settings.public_profile)
          : Boolean(user.instructor_settings?.public_profile ?? true),
      notifications:
        instructor_settings.notifications != null
          ? Boolean(instructor_settings.notifications)
          : Boolean(user.instructor_settings?.notifications ?? true),
    };
  }
  await user.save();
  await logAuditEvent(req, {
    actor_id: user._id,
    actor_role: user.role,
    action: 'auth.update_profile',
    target_type: 'user',
    target_id: user._id,
  });
  res.json(user);
}

async function listTeachers(_req, res) {
  const users = await User.find({ role: { $in: ['teacher', 'admin'] } })
    .select('name email role')
    .sort({ name: 1 })
    .lean();
  res.json(users);
}

module.exports = {
  register,
  login,
  me,
  updateProfile,
  listTeachers,
  sendEmailVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
};
