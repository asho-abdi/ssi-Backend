const { validationResult } = require('express-validator');
const crypto = require('crypto');
const User = require('../models/User');
const { signToken } = require('../utils/jwt');
const { normalizePermissions } = require('../utils/permissions');
const { logAuditEvent } = require('../utils/auditLog');
const { getPrimaryClientUrl } = require('../config/clientUrl');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const { normalizeWhatsAppRecipient } = require('../utils/phoneE164');
const {
  generateNumericOtp,
  hashOtpCode,
  hashResetSession,
  issueResetSessionToken,
} = require('../utils/otpCrypto');
const { sendPasswordResetOtp: sendEmailOtp } = require('../services/emailService');
const { sendPasswordResetOtp: sendWhatsAppOtp, isConfigured: whatsappConfigured } = require('../services/whatsappOtpService');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { recordFailedLogin, clearLoginAttempts } = require('../middleware/loginRateLimit');

const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 10 * 60 * 1000);
const RESET_SESSION_TTL_MS = Number(process.env.RESET_SESSION_TTL_MS || 15 * 60 * 1000);

function normalizePhone(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { ok: false, error: 'Phone number is required' };
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, error: 'Invalid phone number' };
  }
  return { ok: true, value: digits };
}

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

const SSI_USERNAME_DOMAIN = '@ssi.so';

function parseLoginIdentifier(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return { kind: 'empty', value: '' };

  if (value.includes('@')) {
    if (value.endsWith(SSI_USERNAME_DOMAIN)) {
      const local = value.slice(0, -SSI_USERNAME_DOMAIN.length).replace(/[^a-z0-9._]/g, '');
      return { kind: 'username', value: local };
    }
    return { kind: 'email', value };
  }

  return { kind: 'username', value: value.replace(/[^a-z0-9._]/g, '') };
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
  const { name, username, email, password, role, phone, referral_code: referralCodeInput } = req.body;
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }
  const allowedRegisterRoles = ['student'];
  const finalRole = allowedRegisterRoles.includes(role) ? role : 'student';
  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(400).json({ message: 'Email already registered' });
  }
  const usernameValue = String(username || email || '')
    .trim()
    .toLowerCase();
  const usernameExists = await User.findOne({ username: usernameValue });
  if (usernameExists) {
    return res.status(400).json({ message: 'Username already taken' });
  }
  const user = new User({ name, username: usernameValue, email, password, role: finalRole, email_verified: false });

  const phoneTrim = String(phone || '').trim();
  const phoneNorm = normalizePhone(phoneTrim);
  if (!phoneNorm.ok) {
    return res.status(400).json({ message: phoneNorm.error || 'Invalid phone number' });
  }
  user.phone = phoneNorm.value;

  const rawVerificationToken = attachVerificationToken(user);
  await user.save();

  const { ensureUserReferralCode, attachReferralToNewUser } = require('../utils/referral');
  await ensureUserReferralCode(user);
  if (referralCodeInput) {
    const referralResult = await attachReferralToNewUser(user, referralCodeInput);
    if (referralResult.ok && referralResult.referrer) {
      await user.save();
    }
  }
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
  const { password } = req.body;
  const parsed = parseLoginIdentifier(req.body.login);
  if (!parsed.value) {
    return res.status(400).json({ message: 'Email or username is required' });
  }

  const query =
    parsed.kind === 'email' ? { email: parsed.value } : { username: parsed.value };
  const user = await User.findOne(query).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    recordFailedLogin(req);
    await logAuditEvent(req, {
      actor_role: 'anonymous',
      action: 'auth.login',
      status: 'failed',
      target_type: 'user',
      details: { login: parsed.value, kind: parsed.kind },
    });
    return res.status(401).json({ message: 'Invalid email, username, or password' });
  }
  if (user.account_status === 'suspended') {
    return res.status(403).json({ message: 'Account suspended' });
  }
  clearLoginAttempts(req);
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
  const payload = user.toJSON();
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
  const channel = String(req.body?.channel || 'email').toLowerCase();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phoneRaw = String(req.body?.phone || '').trim();

  if (!['email', 'whatsapp'].includes(channel)) {
    return res.status(400).json({ message: 'Invalid channel. Use email or whatsapp.' });
  }

  let user = null;
  let identifier = '';

  if (channel === 'email') {
    if (!email) return res.status(400).json({ message: 'Email is required' });
    identifier = email;
    user = await User.findOne({ email });
  } else {
    if (!phoneRaw) return res.status(400).json({ message: 'Phone number is required' });
    if (!whatsappConfigured()) {
      return res.status(503).json({ message: 'WhatsApp password reset is not configured on this server' });
    }
    const normalized = normalizeWhatsAppRecipient(phoneRaw, process.env.WHATSAPP_DEFAULT_COUNTRY_CODE);
    if (!normalized.ok) return res.status(400).json({ message: normalized.error || 'Invalid phone number' });
    identifier = normalized.e164;
    user = await User.findOne({ phone: normalized.e164 });
  }

  const genericMessage = 'If an account exists, a verification code has been sent.';

  if (!user) {
    return res.json({ message: genericMessage });
  }

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await PasswordResetOtp.countDocuments({ user_id: user._id, createdAt: { $gte: since } });
  if (recent >= Number(process.env.OTP_MAX_PER_HOUR || 5)) {
    return res.status(429).json({ message: 'Too many code requests. Try again in an hour.' });
  }

  const code = generateNumericOtp(6);
  const expiresMinutes = Math.round(OTP_TTL_MS / 60000);

  await PasswordResetOtp.create({
    user_id: user._id,
    channel,
    identifier,
    code_hash: hashOtpCode(code),
    expires_at: new Date(Date.now() + OTP_TTL_MS),
  });

  let sent = { ok: false };
  if (channel === 'email') {
    sent = await sendEmailOtp({ to: user.email, name: user.name, code, expiresMinutes });
  } else {
    sent = await sendWhatsAppOtp({ to: identifier, code, expiresMinutes });
  }

  if (!sent.ok && process.env.NODE_ENV === 'production') {
    return res.status(502).json({ message: sent.error || 'Failed to send verification code' });
  }

  await logAuditEvent(req, {
    actor_id: user._id,
    actor_role: user.role,
    action: 'auth.forgot_password',
    target_type: 'user',
    target_id: user._id,
    details: { channel },
  });

  res.json({
    message: genericMessage,
    channel,
    ...(process.env.NODE_ENV !== 'production' ? { dev_code: code } : {}),
  });
}

async function verifyResetCode(req, res) {
  const channel = String(req.body?.channel || 'email').toLowerCase();
  const code = String(req.body?.code || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phoneRaw = String(req.body?.phone || '').trim();

  if (!code || code.length < 4) {
    return res.status(400).json({ message: 'Verification code is required' });
  }

  let identifier = '';
  if (channel === 'email') {
    if (!email) return res.status(400).json({ message: 'Email is required' });
    identifier = email;
  } else {
    const normalized = normalizeWhatsAppRecipient(phoneRaw, process.env.WHATSAPP_DEFAULT_COUNTRY_CODE);
    if (!normalized.ok) return res.status(400).json({ message: normalized.error || 'Invalid phone number' });
    identifier = normalized.e164;
  }

  const row = await PasswordResetOtp.findOne({
    channel,
    identifier,
    verified_at: null,
    expires_at: { $gt: new Date() },
  })
    .select('+code_hash +reset_session_hash')
    .sort({ createdAt: -1 });

  if (!row) {
    return res.status(400).json({ message: 'No active verification code. Request a new one.' });
  }

  if (row.attempts >= row.max_attempts) {
    return res.status(429).json({ message: 'Too many attempts. Request a new code.' });
  }

  row.attempts += 1;
  await row.save();

  if (row.code_hash !== hashOtpCode(code)) {
    return res.status(400).json({ message: 'Invalid verification code' });
  }

  const resetSessionToken = issueResetSessionToken();
  row.verified_at = new Date();
  row.reset_session_hash = hashResetSession(resetSessionToken);
  row.expires_at = new Date(Date.now() + RESET_SESSION_TTL_MS);
  await row.save();

  await logAuditEvent(req, {
    actor_id: row.user_id,
    actor_role: 'anonymous',
    action: 'auth.verify_reset_code',
    target_type: 'user',
    target_id: row.user_id,
  });

  res.json({
    message: 'Code verified',
    reset_session_token: resetSessionToken,
  });
}

async function resetPasswordWithCode(req, res) {
  const resetSessionToken = String(req.body?.reset_session_token || '').trim();
  const nextPassword = String(req.body?.password || '');

  if (!resetSessionToken) return res.status(400).json({ message: 'Reset session token is required' });
  const passwordError = validatePasswordStrength(nextPassword);
  if (passwordError) return res.status(400).json({ message: passwordError });

  const row = await PasswordResetOtp.findOne({
    reset_session_hash: hashResetSession(resetSessionToken),
    verified_at: { $ne: null },
    expires_at: { $gt: new Date() },
  }).select('+reset_session_hash');

  if (!row) {
    return res.status(400).json({ message: 'Reset session is invalid or expired. Start again.' });
  }

  const user = await User.findById(row.user_id).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.password = nextPassword;
  user.password_reset_token_hash = '';
  user.password_reset_expires_at = null;
  await user.save();

  row.reset_session_hash = '';
  await row.save();

  await logAuditEvent(req, {
    actor_id: user._id,
    actor_role: user.role,
    action: 'auth.reset_password',
    target_type: 'user',
    target_id: user._id,
    details: { method: 'otp' },
  });

  res.json({ message: 'Password reset successful' });
}

async function forgotPasswordLegacy(req, res) {
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
  const passwordError = validatePasswordStrength(nextPassword);
  if (passwordError) return res.status(400).json({ message: passwordError });
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
  verifyResetCode,
  resetPasswordWithCode,
  forgotPasswordLegacy,
  resetPassword,
};
