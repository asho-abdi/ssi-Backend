const PlatformSettings = require('../models/PlatformSettings');
const Course = require('../models/Course');
const User = require('../models/User');
const Referral = require('../models/Referral');
const AffiliateCommission = require('../models/AffiliateCommission');

async function getDefaultAffiliatePercent() {
  const settings = await PlatformSettings.findOne({ key: 'default' }).lean();
  const pct = Number(settings?.payment?.affiliate_commission_percent);
  if (Number.isFinite(pct)) return Math.max(0, Math.min(100, pct));
  return 10;
}

async function getAffiliatePercentForCourse(courseId) {
  if (!courseId) return getDefaultAffiliatePercent();
  const course = await Course.findById(courseId).select('affiliate_commission_percent').lean();
  if (course && course.affiliate_commission_percent != null) {
    const pct = Number(course.affiliate_commission_percent);
    if (Number.isFinite(pct)) return Math.max(0, Math.min(100, pct));
  }
  return getDefaultAffiliatePercent();
}

async function getAffiliateHoldDays() {
  const settings = await PlatformSettings.findOne({ key: 'default' }).lean();
  const days = Number(settings?.payment?.affiliate_hold_days);
  if (Number.isFinite(days) && days >= 0) return days;
  const fallback = Number(settings?.payment?.withdrawal?.hold_days);
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : 7;
}

function isAffiliateProgramEnabled(settings) {
  if (!settings?.payment) return true;
  return settings.payment.affiliate_program_enabled !== false;
}

/**
 * Credit referrer when a referred student completes a paid purchase.
 * Idempotent per order_id. Does not modify instructor earnings.
 */
async function processAffiliateCommissionForOrder(order) {
  if (!order || order.status !== 'paid') return null;

  const purchaseAmount = Number(order.amount || 0);
  if (purchaseAmount <= 0) return null;

  const existing = await AffiliateCommission.findOne({ order_id: order._id });
  if (existing) return existing;

  const buyer = await User.findById(order.user_id).select('_id referred_by role').lean();
  if (!buyer?.referred_by) return null;

  const referrerId = buyer.referred_by;
  if (String(referrerId) === String(buyer._id)) return null;

  const referrer = await User.findById(referrerId).select('_id role').lean();
  if (!referrer || referrer.role !== 'student') return null;

  const settings = await PlatformSettings.findOne({ key: 'default' }).lean();
  if (!isAffiliateProgramEnabled(settings)) return null;

  const percent = await getAffiliatePercentForCourse(order.course_id);
  if (percent <= 0) return null;

  const commissionAmount = Number(((purchaseAmount * percent) / 100).toFixed(2));
  if (commissionAmount <= 0) return null;

  const holdDays = await getAffiliateHoldDays();
  const availableAt = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000);
  const status = holdDays > 0 ? 'pending' : 'available';

  const commission = await AffiliateCommission.create({
    referrer_id: referrerId,
    referred_user_id: buyer._id,
    order_id: order._id,
    course_id: order.course_id,
    purchase_amount: purchaseAmount,
    commission_percent: percent,
    commission_amount: commissionAmount,
    status,
    available_at: availableAt,
  });

  await Referral.findOneAndUpdate(
    { referred_user_id: buyer._id },
    {
      status: 'converted',
      first_purchase_at: new Date(),
    }
  );

  order.referrer_id = referrerId;
  order.affiliate_commission_amount = commissionAmount;
  await order.save();

  return commission;
}

/** Move pending commissions to available when hold period elapsed. */
async function releaseDueAffiliateCommissions(referrerId = null) {
  const now = new Date();
  const filter = {
    status: 'pending',
    available_at: { $lte: now },
  };
  if (referrerId) filter.referrer_id = referrerId;

  const result = await AffiliateCommission.updateMany(filter, {
    $set: { status: 'available' },
  });
  return result.modifiedCount || 0;
}

async function computeAffiliateWallet(referrerId) {
  await releaseDueAffiliateCommissions(referrerId);

  const baseMatch = { referrer_id: referrerId, status: { $ne: 'cancelled' } };

  const [totals] = await AffiliateCommission.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$commission_amount' },
        pendingEarnings: {
          $sum: {
            $cond: [{ $eq: ['$status', 'pending'] }, '$commission_amount', 0],
          },
        },
        availableBalance: {
          $sum: {
            $cond: [{ $eq: ['$status', 'available'] }, '$commission_amount', 0],
          },
        },
        withdrawnEarnings: {
          $sum: {
            $cond: [{ $eq: ['$status', 'paid'] }, '$commission_amount', 0],
          },
        },
        successfulPurchases: {
          $sum: { $cond: [{ $in: ['$status', ['pending', 'available', 'paid']] }, 1, 0] },
        },
      },
    },
  ]);

  const referralCount = await Referral.countDocuments({ referrer_id: referrerId });

  return {
    totalReferrals: referralCount,
    successfulPurchases: totals?.successfulPurchases || 0,
    totalEarnings: Number((totals?.totalEarnings || 0).toFixed(2)),
    pendingEarnings: Number((totals?.pendingEarnings || 0).toFixed(2)),
    availableBalance: Number((totals?.availableBalance || 0).toFixed(2)),
    withdrawnEarnings: Number((totals?.withdrawnEarnings || 0).toFixed(2)),
  };
}

module.exports = {
  getDefaultAffiliatePercent,
  getAffiliatePercentForCourse,
  processAffiliateCommissionForOrder,
  releaseDueAffiliateCommissions,
  computeAffiliateWallet,
};
