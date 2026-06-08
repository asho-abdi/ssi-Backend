const { validationResult } = require('express-validator');
const User = require('../models/User');
const Referral = require('../models/Referral');
const AffiliateCommission = require('../models/AffiliateCommission');
const AffiliateWithdrawal = require('../models/AffiliateWithdrawal');
const PlatformSettings = require('../models/PlatformSettings');
const { getPrimaryClientUrl } = require('../config/clientUrl');
const { buildReferralLink, ensureUserReferralCode } = require('../utils/referral');
const { computeAffiliateWallet, getDefaultAffiliatePercent } = require('../utils/affiliateCommission');

async function getDashboard(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const code = await ensureUserReferralCode(user);
  const link = buildReferralLink(code, getPrimaryClientUrl());
  const wallet = await computeAffiliateWallet(req.userId);
  const globalPercent = await getDefaultAffiliatePercent();

  res.json({
    referral_code: code,
    referral_link: link,
    commission_percent_default: globalPercent,
    stats: wallet,
  });
}

async function getReferrals(req, res) {
  const referrals = await Referral.find({ referrer_id: req.userId })
    .populate('referred_user_id', 'name email createdAt')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  res.json(
    referrals.map((r) => ({
      _id: r._id,
      referred_user_name: r.referred_user_id?.name || 'User',
      referred_user_email: r.referred_user_id?.email || '',
      registration_date: r.registered_at || r.referred_user_id?.createdAt,
      status: r.status,
      first_purchase_at: r.first_purchase_at,
      referral_code_used: r.referral_code_used,
    }))
  );
}

async function getCommissionHistory(req, res) {
  const rows = await AffiliateCommission.find({ referrer_id: req.userId })
    .populate('referred_user_id', 'name email')
    .populate('course_id', 'title')
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  res.json(
    rows.map((row) => ({
      _id: row._id,
      referred_user_name: row.referred_user_id?.name || 'User',
      course_title: row.course_id?.title || 'Course',
      purchase_amount: row.purchase_amount,
      commission_percent: row.commission_percent,
      earned_commission: row.commission_amount,
      status: row.status,
      created_at: row.createdAt,
      available_at: row.available_at,
    }))
  );
}

async function listMyWithdrawals(req, res) {
  const rows = await AffiliateWithdrawal.find({ affiliate_id: req.userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json(rows);
}

async function requestWithdrawal(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const amount = Number(req.body.amount);
  const method = String(req.body.method || '').toLowerCase();
  const accountDetails = String(req.body.account_details || '').trim();

  const settings = await PlatformSettings.findOne({ key: 'default' }).lean();
  const minAmount = Number(settings?.payment?.withdrawal?.min_amount ?? 50);
  if (!Number.isFinite(amount) || amount < minAmount) {
    return res.status(400).json({ message: `Minimum withdrawal is ${minAmount}` });
  }

  const allowed = ['manual', 'bank_transfer', 'paypal', 'e_check', 'evc_plus', 'zaad', 'sahal'];
  if (!allowed.includes(method)) {
    return res.status(400).json({ message: 'Invalid withdrawal method' });
  }

  const wallet = await computeAffiliateWallet(req.userId);
  if (amount > wallet.availableBalance) {
    return res.status(400).json({ message: 'Amount exceeds available balance' });
  }

  const pending = await AffiliateWithdrawal.findOne({
    affiliate_id: req.userId,
    status: 'pending',
  });
  if (pending) {
    return res.status(400).json({ message: 'You already have a pending withdrawal request' });
  }

  const withdrawal = await AffiliateWithdrawal.create({
    affiliate_id: req.userId,
    amount,
    method,
    account_details: accountDetails,
    status: 'pending',
  });

  res.status(201).json(withdrawal);
}

async function validateReferralCode(req, res) {
  const code = String(req.query.code || req.params.code || '').trim();
  const { resolveReferrerByCode, normalizeReferralCode } = require('../utils/referral');
  const normalized = normalizeReferralCode(code);
  if (!normalized) return res.json({ valid: false });

  const referrer = await resolveReferrerByCode(normalized);
  if (!referrer) return res.json({ valid: false });

  if (req.userId && String(referrer._id) === String(req.userId)) {
    return res.json({ valid: false, reason: 'self_referral' });
  }

  res.json({
    valid: true,
    code: normalized,
    referrer_name: referrer.name,
  });
}

module.exports = {
  getDashboard,
  getReferrals,
  getCommissionHistory,
  listMyWithdrawals,
  requestWithdrawal,
  validateReferralCode,
};
