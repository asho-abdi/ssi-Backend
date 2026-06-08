const crypto = require('crypto');
const User = require('../models/User');
const Referral = require('../models/Referral');

const REFERRAL_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeReferralCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

async function generateUniqueReferralCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 8; i += 1) {
      code += REFERRAL_CODE_CHARS[bytes[i % bytes.length] % REFERRAL_CODE_CHARS.length];
    }
    const exists = await User.exists({ referral_code: code });
    if (!exists) return code;
  }
  return `U${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function ensureUserReferralCode(user) {
  if (!user || user.referral_code) return user.referral_code;
  user.referral_code = await generateUniqueReferralCode();
  await user.save();
  return user.referral_code;
}

async function resolveReferrerByCode(code) {
  const normalized = normalizeReferralCode(code);
  if (!normalized || normalized.length < 4) return null;
  const referrer = await User.findOne({
    referral_code: normalized,
    role: 'student',
  }).select('_id name email referral_code role');
  return referrer;
}

/**
 * Attach referral on registration. Returns { ok, referrer, referral } or { ok: false, reason }.
 */
async function attachReferralToNewUser(newUser, referralCodeInput) {
  const code = normalizeReferralCode(referralCodeInput);
  if (!code) return { ok: true, skipped: true };

  const referrer = await resolveReferrerByCode(code);
  if (!referrer) {
    return { ok: false, reason: 'invalid_code' };
  }

  if (String(referrer._id) === String(newUser._id)) {
    return { ok: false, reason: 'self_referral' };
  }

  const existing = await Referral.findOne({ referred_user_id: newUser._id });
  if (existing) {
    return { ok: false, reason: 'already_referred' };
  }

  newUser.referred_by = referrer._id;
  newUser.referred_at = new Date();

  const referral = await Referral.create({
    referrer_id: referrer._id,
    referred_user_id: newUser._id,
    referral_code_used: code,
    status: 'registered',
    registered_at: new Date(),
  });

  return { ok: true, referrer, referral };
}

function buildReferralLink(referralCode, clientUrl) {
  const base = String(clientUrl || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const code = normalizeReferralCode(referralCode);
  return `${base}/register?ref=${encodeURIComponent(code)}`;
}

module.exports = {
  normalizeReferralCode,
  generateUniqueReferralCode,
  ensureUserReferralCode,
  resolveReferrerByCode,
  attachReferralToNewUser,
  buildReferralLink,
};
