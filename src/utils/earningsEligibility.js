const Order = require('../models/Order');
const { calculateEarnings } = require('./commission');
const { processAffiliateCommissionForOrder } = require('./affiliateCommission');

/**
 * Migrated / admin-granted students can access courses without affecting
 * instructor commission, revenue reports, or payout calculations.
 */
function parseExcludeFromTeacherEarnings(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/** Mongo filter for paid orders that count in financial / commission stats. */
function earningsEligiblePaidOrderQuery(extra = {}) {
  return {
    status: 'paid',
    exclude_from_teacher_earnings: { $ne: true },
    ...extra,
  };
}

function buildCommissionSplit(amount, instructorPercentage, excludeFromTeacherEarnings) {
  const exclude = Boolean(excludeFromTeacherEarnings);
  if (exclude) {
    return {
      instructor_percentage: instructorPercentage,
      instructor_earning: 0,
      admin_earning: 0,
    };
  }
  return calculateEarnings(amount, instructorPercentage);
}

/**
 * Create or update a paid order tied to an approved enrollment.
 * When excluded, access still works (enrollment + paid order) but earnings stay zero.
 */
async function upsertPaidOrderForEnrollment({
  studentId,
  courseId,
  instructorId,
  amount,
  originalAmount,
  discountAmount = 0,
  instructorPercentage,
  excludeFromTeacherEarnings = false,
  paymentMethod = 'admin_manual',
  paymentStatusDetail = 'offline_confirmed',
}) {
  const exclude = Boolean(excludeFromTeacherEarnings);
  const split = buildCommissionSplit(amount, instructorPercentage, exclude);
  const payload = {
    instructor_id: instructorId,
    original_amount: originalAmount,
    discount_amount: discountAmount,
    amount,
    instructor_percentage: split.instructor_percentage,
    instructor_earning: split.instructor_earning,
    admin_earning: split.admin_earning,
    exclude_from_teacher_earnings: exclude,
    status: 'paid',
    payment_provider: 'manual',
    payment_method: paymentMethod,
    payment_status_detail: paymentStatusDetail,
    paid_at: new Date(),
  };

  let order = await Order.findOne({ user_id: studentId, course_id: courseId });
  if (!order) {
    order = await Order.create({
      user_id: studentId,
      course_id: courseId,
      ...payload,
    });
  } else {
    Object.assign(order, payload);
    await order.save();
  }

  try {
    await processAffiliateCommissionForOrder(order);
  } catch (err) {
    console.error('[affiliate] Commission processing failed:', err?.message || err);
  }

  return order;
}

module.exports = {
  parseExcludeFromTeacherEarnings,
  earningsEligiblePaidOrderQuery,
  buildCommissionSplit,
  upsertPaidOrderForEnrollment,
};
