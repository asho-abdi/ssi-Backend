const { validationResult } = require('express-validator');
const User = require('../models/User');
const Referral = require('../models/Referral');
const AffiliateCommission = require('../models/AffiliateCommission');
const AffiliateWithdrawal = require('../models/AffiliateWithdrawal');
const PlatformSettings = require('../models/PlatformSettings');
const Course = require('../models/Course');
const { computeAffiliateWallet } = require('../utils/affiliateCommission');

async function getSettings(req, res) {
  const doc = await PlatformSettings.findOne({ key: 'default' }).lean();
  res.json({
    affiliate_program_enabled: doc?.payment?.affiliate_program_enabled !== false,
    affiliate_commission_percent: Number(doc?.payment?.affiliate_commission_percent ?? 10),
    affiliate_hold_days: Number(doc?.payment?.affiliate_hold_days ?? 7),
  });
}

async function updateSettings(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const doc = await PlatformSettings.findOneAndUpdate(
    { key: 'default' },
    {
      $set: {
        'payment.affiliate_program_enabled': Boolean(req.body.affiliate_program_enabled),
        'payment.affiliate_commission_percent': Math.max(
          0,
          Math.min(100, Number(req.body.affiliate_commission_percent))
        ),
        'payment.affiliate_hold_days': Math.max(0, Number(req.body.affiliate_hold_days)),
      },
    },
    { new: true, upsert: true }
  );

  res.json({
    affiliate_program_enabled: doc.payment.affiliate_program_enabled,
    affiliate_commission_percent: doc.payment.affiliate_commission_percent,
    affiliate_hold_days: doc.payment.affiliate_hold_days,
  });
}

async function getOverview(req, res) {
  const [commissionStats] = await AffiliateCommission.aggregate([
    { $match: { status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: null,
        total_commissions: { $sum: '$commission_amount' },
        total_orders: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$commission_amount', 0] },
        },
        available: {
          $sum: { $cond: [{ $eq: ['$status', 'available'] }, '$commission_amount', 0] },
        },
        paid: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$commission_amount', 0] },
        },
      },
    },
  ]);

  const totalReferrals = await Referral.countDocuments();
  const convertedReferrals = await Referral.countDocuments({ status: 'converted' });
  const pendingWithdrawals = await AffiliateWithdrawal.countDocuments({ status: 'pending' });

  const topAffiliates = await AffiliateCommission.aggregate([
    { $match: { status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: '$referrer_id',
        total_earned: { $sum: '$commission_amount' },
        sales: { $sum: 1 },
      },
    },
    { $sort: { total_earned: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        referrer_id: '$_id',
        name: '$user.name',
        email: '$user.email',
        referral_code: '$user.referral_code',
        total_earned: 1,
        sales: 1,
      },
    },
  ]);

  res.json({
    totals: {
      total_commissions: Number((commissionStats?.total_commissions || 0).toFixed(2)),
      total_orders: commissionStats?.total_orders || 0,
      pending: Number((commissionStats?.pending || 0).toFixed(2)),
      available: Number((commissionStats?.available || 0).toFixed(2)),
      paid: Number((commissionStats?.paid || 0).toFixed(2)),
      total_referrals: totalReferrals,
      converted_referrals: convertedReferrals,
      pending_withdrawals: pendingWithdrawals,
    },
    top_affiliates: topAffiliates,
  });
}

async function listCommissions(req, res) {
  const rows = await AffiliateCommission.find()
    .populate('referrer_id', 'name email referral_code')
    .populate('referred_user_id', 'name email')
    .populate('course_id', 'title')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  res.json(rows);
}

async function listWithdrawals(req, res) {
  const status = String(req.query.status || '').trim();
  const filter = status ? { status } : {};
  const rows = await AffiliateWithdrawal.find(filter)
    .populate('affiliate_id', 'name email referral_code')
    .populate('reviewed_by', 'name email')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json(rows);
}

async function reviewWithdrawal(req, res) {
  const action = String(req.body.action || '').toLowerCase();
  if (!['approve', 'reject', 'paid'].includes(action)) {
    return res.status(400).json({ message: 'action must be approve, reject, or paid' });
  }

  const withdrawal = await AffiliateWithdrawal.findById(req.params.id);
  if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });

  if (action === 'approve') {
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be approved' });
    }
    const wallet = await computeAffiliateWallet(withdrawal.affiliate_id);
    if (withdrawal.amount > wallet.availableBalance) {
      return res.status(400).json({ message: 'Insufficient affiliate balance' });
    }

    const commissions = await AffiliateCommission.find({
      referrer_id: withdrawal.affiliate_id,
      status: 'available',
    }).sort({ createdAt: 1 });

    let remaining = withdrawal.amount;
    for (const row of commissions) {
      if (remaining <= 0) break;
      if (row.commission_amount <= remaining + 0.001) {
        row.status = 'paid';
        row.withdrawal_id = withdrawal._id;
        row.paid_at = new Date();
        await row.save();
        remaining = Number((remaining - row.commission_amount).toFixed(2));
      }
    }

    if (remaining > 0.01) {
      return res.status(400).json({ message: 'Could not allocate commissions to withdrawal amount' });
    }

    withdrawal.status = 'approved';
    withdrawal.reviewed_by = req.userId;
    withdrawal.reviewed_at = new Date();
    await withdrawal.save();
    return res.json(withdrawal);
  }

  if (action === 'paid') {
    withdrawal.status = 'paid';
    withdrawal.paid_at = new Date();
    if (!withdrawal.reviewed_at) {
      withdrawal.reviewed_by = req.userId;
      withdrawal.reviewed_at = new Date();
    }
    await withdrawal.save();
    return res.json(withdrawal);
  }

  if (withdrawal.status === 'paid') {
    return res.status(400).json({ message: 'Paid withdrawals cannot be rejected' });
  }
  withdrawal.status = 'rejected';
  withdrawal.note = String(req.body.note || withdrawal.note || '');
  withdrawal.reviewed_by = req.userId;
  withdrawal.reviewed_at = new Date();
  await withdrawal.save();
  res.json(withdrawal);
}

async function updateCourseAffiliatePercent(req, res) {
  const pct = req.body.affiliate_commission_percent;
  const course = await Course.findByIdAndUpdate(
    req.params.courseId,
    {
      affiliate_commission_percent:
        pct === null || pct === '' ? null : Math.max(0, Math.min(100, Number(pct))),
    },
    { new: true }
  ).select('title affiliate_commission_percent');
  if (!course) return res.status(404).json({ message: 'Course not found' });
  res.json(course);
}

async function backfillReferralCodes(req, res) {
  const students = await User.find({ role: 'student', referral_code: { $in: [null, ''] } }).limit(500);
  const { ensureUserReferralCode } = require('../utils/referral');
  let updated = 0;
  for (const student of students) {
    await ensureUserReferralCode(student);
    updated += 1;
  }
  res.json({ updated, remaining: await User.countDocuments({ role: 'student', referral_code: { $in: [null, ''] } }) });
}

module.exports = {
  getSettings,
  updateSettings,
  getOverview,
  listCommissions,
  listWithdrawals,
  reviewWithdrawal,
  updateCourseAffiliatePercent,
  backfillReferralCodes,
};
