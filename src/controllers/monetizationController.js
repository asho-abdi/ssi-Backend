const Course = require('../models/Course');
const Order = require('../models/Order');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const PlatformSettings = require('../models/PlatformSettings');
const { calculateEarnings, getInstructorPercentage } = require('../utils/commission');

async function getSettingsDoc() {
  let settings = await PlatformSettings.findOne({ key: 'default' });
  if (!settings) settings = await PlatformSettings.create({ key: 'default' });
  return settings;
}

function getCommissionAndCurrency(settings) {
  const commission = Math.max(0, Math.min(100, Number(settings?.payment?.instructor_commission_percent ?? 70)));
  const currency = String(settings?.general?.currency || 'USD').toUpperCase();
  return { commission, currency };
}

function getWithdrawalRules(settings) {
  const withdrawal = settings?.payment?.withdrawal || {};
  const min_amount = Math.max(0, Number(withdrawal?.min_amount ?? 50));
  const hold_days = Math.max(0, Number(withdrawal?.hold_days ?? 7));
  const methods = {
    manual: Boolean(withdrawal?.methods?.manual ?? true),
    bank_transfer: Boolean(withdrawal?.methods?.bank_transfer ?? false),
    e_check: Boolean(withdrawal?.methods?.e_check ?? false),
    paypal: Boolean(withdrawal?.methods?.paypal ?? false),
  };
  const bank_instructions = String(withdrawal?.bank_instructions || '');
  return { min_amount, hold_days, methods, bank_instructions };
}

async function computeInstructorWallet(instructorId, settings) {
  const { commission, currency } = getCommissionAndCurrency(settings);
  const rules = getWithdrawalRules(settings);
  const courses = await Course.find({ teacher_id: instructorId }).select('_id').lean();
  const ids = courses.map((row) => row._id);
  if (!ids.length) {
    return {
      currency,
      rules,
      total_earnings: 0,
      pending_balance: 0,
      available_balance: 0,
      pending_requests: 0,
      withdrawn_total: 0,
      eligible: false,
    };
  }

  const paidOrders = await Order.find({ course_id: { $in: ids }, status: 'paid' })
    .select('amount instructor_earning instructor_percentage paid_at createdAt')
    .lean();
  const now = Date.now();
  const holdMs = rules.hold_days * 24 * 60 * 60 * 1000;
  let total = 0;
  let pending = 0;
  let availableRaw = 0;
  for (const order of paidOrders) {
    const amount = Number(order.amount || 0);
    let instructor = Number(order.instructor_earning || 0);
    if (!(instructor > 0) && amount > 0) {
      const pct = Number.isFinite(Number(order.instructor_percentage))
        ? Number(order.instructor_percentage)
        : commission;
      instructor = Number(calculateEarnings(amount, pct).instructor_earning);
    }
    total += instructor;
    const paidAt = new Date(order.paid_at || order.createdAt || 0).getTime();
    if (paidAt > 0 && now - paidAt < holdMs) pending += instructor;
    else availableRaw += instructor;
  }

  const requests = await WithdrawalRequest.find({ instructor_id: instructorId })
    .select('amount status')
    .lean();
  const pendingRequests = requests
    .filter((row) => row.status === 'pending')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const approvedRequests = requests
    .filter((row) => row.status === 'approved')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const available = Math.max(0, Number((availableRaw - pendingRequests - approvedRequests).toFixed(2)));

  return {
    currency,
    rules,
    total_earnings: Number(total.toFixed(2)),
    pending_balance: Number(pending.toFixed(2)),
    available_balance: available,
    pending_requests: Number(pendingRequests.toFixed(2)),
    withdrawn_total: Number(approvedRequests.toFixed(2)),
    eligible: available >= rules.min_amount,
  };
}

async function overview(_req, res) {
  const settings = await getSettingsDoc();
  const { commission, currency } = getCommissionAndCurrency(settings);
  const paidOrders = await Order.find({ status: 'paid' })
    .populate('course_id', 'title teacher_id')
    .lean();

  let totalRevenue = 0;
  let totalInstructorEarnings = 0;
  const salesByCourse = {};
  const instructorTotals = {};

  for (const order of paidOrders) {
    const amount = Number(order.amount || 0);
    totalRevenue += amount;
    const instructorShare =
      Number(order.instructor_earning || 0) > 0
        ? Number(order.instructor_earning || 0)
        : Number(calculateEarnings(amount, commission).instructor_earning);
    totalInstructorEarnings += instructorShare;

    const courseId = String(order.course_id?._id || order.course_id || '');
    if (courseId) {
      if (!salesByCourse[courseId]) {
        salesByCourse[courseId] = {
          course_id: courseId,
          course_title: order.course_id?.title || 'Course',
          sales: 0,
          revenue: 0,
          instructor_earnings: 0,
        };
      }
      salesByCourse[courseId].sales += 1;
      salesByCourse[courseId].revenue += amount;
      salesByCourse[courseId].instructor_earnings += instructorShare;
    }

    const instructorId = String(order.course_id?.teacher_id || '');
    if (instructorId) {
      instructorTotals[instructorId] = (instructorTotals[instructorId] || 0) + instructorShare;
    }
  }

  const instructorIds = Object.keys(instructorTotals);
  const instructors = instructorIds.length
    ? await User.find({ _id: { $in: instructorIds } }).select('name email').lean()
    : [];
  const instructorById = Object.fromEntries(instructors.map((u) => [String(u._id), u]));

  res.json({
    currency,
    totals: {
      platform_revenue: Number(totalRevenue.toFixed(2)),
      instructor_earnings: Number(totalInstructorEarnings.toFixed(2)),
      paid_sales: paidOrders.length,
    },
    course_sales: Object.values(salesByCourse)
      .sort((a, b) => b.revenue - a.revenue)
      .map((row) => ({
        ...row,
        revenue: Number(row.revenue.toFixed(2)),
        instructor_earnings: Number(row.instructor_earnings.toFixed(2)),
      })),
    instructor_sales: instructorIds
      .map((id) => ({
        instructor_id: id,
        instructor_name: instructorById[id]?.name || 'Instructor',
        instructor_email: instructorById[id]?.email || '',
        earnings: Number(instructorTotals[id].toFixed(2)),
      }))
      .sort((a, b) => b.earnings - a.earnings),
  });
}

async function listCoursePricing(_req, res) {
  const courses = await Course.find({})
    .populate('teacher_id', 'name email')
    .select('title pricing_type is_premium price sale_price teacher_id createdAt')
    .sort({ createdAt: -1 })
    .lean();
  res.json(courses);
}

async function updateCoursePricing(req, res) {
  const { id } = req.params;
  const course = await Course.findById(id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  const payload = req.body || {};
  if (payload.pricing_type != null) {
    const type = String(payload.pricing_type).toLowerCase();
    if (!['free', 'paid'].includes(type)) return res.status(400).json({ message: 'Invalid pricing_type' });
    course.pricing_type = type;
  }
  if (payload.is_premium != null) {
    course.is_premium = Boolean(payload.is_premium);
  }
  if (payload.price != null) {
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Invalid price' });
    course.price = price;
  }
  if (payload.sale_price != null) {
    const sale = Number(payload.sale_price);
    if (!Number.isFinite(sale) || sale < 0) return res.status(400).json({ message: 'Invalid sale_price' });
    course.sale_price = Math.min(sale, Number(course.price));
  }
  await course.save();
  const populated = await Course.findById(course._id).populate('teacher_id', 'name email');
  res.json(populated);
}

async function listCoupons(_req, res) {
  const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean();
  res.json(coupons);
}

async function createCoupon(req, res) {
  const body = req.body || {};
  const code = String(body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ message: 'code is required' });
  const discount_type = String(body.discount_type || '').toLowerCase();
  if (!['percentage', 'fixed'].includes(discount_type)) {
    return res.status(400).json({ message: 'discount_type must be percentage or fixed' });
  }
  const discount_value = Number(body.discount_value);
  if (!Number.isFinite(discount_value) || discount_value < 0) {
    return res.status(400).json({ message: 'discount_value must be non-negative' });
  }
  const usage_limit = Number(body.usage_limit || 1);
  if (!Number.isFinite(usage_limit) || usage_limit < 1) {
    return res.status(400).json({ message: 'usage_limit must be at least 1' });
  }
  const coupon = await Coupon.create({
    code,
    discount_type,
    discount_value,
    expires_at: body.expires_at || null,
    usage_limit,
    active: body.active !== false,
  });
  res.status(201).json(coupon);
}

async function updateCoupon(req, res) {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
  const body = req.body || {};
  if (body.discount_type != null) {
    const discount_type = String(body.discount_type).toLowerCase();
    if (!['percentage', 'fixed'].includes(discount_type)) {
      return res.status(400).json({ message: 'Invalid discount_type' });
    }
    coupon.discount_type = discount_type;
  }
  if (body.discount_value != null) {
    const value = Number(body.discount_value);
    if (!Number.isFinite(value) || value < 0) return res.status(400).json({ message: 'Invalid discount_value' });
    coupon.discount_value = value;
  }
  if (body.expires_at != null) coupon.expires_at = body.expires_at || null;
  if (body.usage_limit != null) {
    const usage = Number(body.usage_limit);
    if (!Number.isFinite(usage) || usage < 1) return res.status(400).json({ message: 'Invalid usage_limit' });
    coupon.usage_limit = usage;
  }
  if (body.active != null) coupon.active = Boolean(body.active);
  await coupon.save();
  res.json(coupon);
}

async function deleteCoupon(req, res) {
  const deleted = await Coupon.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Coupon not found' });
  res.json({ message: 'Coupon deleted' });
}

async function listPlans(_req, res) {
  const plans = await SubscriptionPlan.find({})
    .populate('course_ids', 'title')
    .sort({ createdAt: -1 })
    .lean();
  res.json(plans);
}

async function createPlan(req, res) {
  const body = req.body || {};
  const billing_cycle = String(body.billing_cycle || '').toLowerCase();
  const access_scope = String(body.access_scope || 'all_courses').toLowerCase();
  if (!['monthly', 'yearly'].includes(billing_cycle)) return res.status(400).json({ message: 'Invalid billing_cycle' });
  if (!['all_courses', 'selected_courses'].includes(access_scope)) return res.status(400).json({ message: 'Invalid access_scope' });
  const plan = await SubscriptionPlan.create({
    name: String(body.name || '').trim(),
    billing_cycle,
    price: Number(body.price || 0),
    access_scope,
    course_ids: access_scope === 'selected_courses' ? body.course_ids || [] : [],
    active: body.active !== false,
  });
  const populated = await SubscriptionPlan.findById(plan._id).populate('course_ids', 'title');
  res.status(201).json(populated);
}

async function updatePlan(req, res) {
  const plan = await SubscriptionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ message: 'Plan not found' });
  const body = req.body || {};
  if (body.name != null) plan.name = String(body.name).trim();
  if (body.billing_cycle != null) {
    const cycle = String(body.billing_cycle).toLowerCase();
    if (!['monthly', 'yearly'].includes(cycle)) return res.status(400).json({ message: 'Invalid billing_cycle' });
    plan.billing_cycle = cycle;
  }
  if (body.price != null) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Invalid price' });
    plan.price = price;
  }
  if (body.access_scope != null) {
    const scope = String(body.access_scope).toLowerCase();
    if (!['all_courses', 'selected_courses'].includes(scope)) return res.status(400).json({ message: 'Invalid access_scope' });
    plan.access_scope = scope;
    if (scope === 'all_courses') plan.course_ids = [];
  }
  if (body.course_ids != null && plan.access_scope === 'selected_courses') {
    plan.course_ids = Array.isArray(body.course_ids) ? body.course_ids : [];
  }
  if (body.active != null) plan.active = Boolean(body.active);
  await plan.save();
  const populated = await SubscriptionPlan.findById(plan._id).populate('course_ids', 'title');
  res.json(populated);
}

async function deletePlan(req, res) {
  const deleted = await SubscriptionPlan.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Plan not found' });
  res.json({ message: 'Plan deleted' });
}

async function listWithdrawals(req, res) {
  const withdrawals = await WithdrawalRequest.find({})
    .populate('instructor_id', 'name email')
    .populate('reviewed_by', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  res.json(withdrawals);
}

async function myWithdrawals(req, res) {
  const settings = await getSettingsDoc();
  const wallet = await computeInstructorWallet(req.userId, settings);
  const requests = await WithdrawalRequest.find({ instructor_id: req.userId })
    .populate('reviewed_by', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  res.json({
    wallet,
    requests,
  });
}

async function createWithdrawal(req, res) {
  const body = req.body || {};
  const method = String(body.method || '').toLowerCase();
  if (!['manual', 'bank_transfer', 'paypal', 'e_check'].includes(method)) {
    return res.status(400).json({ message: 'Invalid payout method' });
  }
  const settings = await getSettingsDoc();
  const wallet = await computeInstructorWallet(req.userId, settings);
  if (!wallet.rules.methods[method]) {
    return res.status(400).json({ message: 'Selected withdraw method is disabled by admin' });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'amount must be greater than 0' });
  }
  if (amount < wallet.rules.min_amount) {
    return res.status(400).json({ message: `Minimum withdrawal is ${wallet.currency} ${wallet.rules.min_amount.toFixed(2)}` });
  }
  if (amount > wallet.available_balance) {
    return res.status(400).json({ message: 'Amount exceeds available balance' });
  }
  const row = await WithdrawalRequest.create({
    instructor_id: req.userId,
    amount,
    method,
    account_details: String(body.account_details || ''),
    note: String(body.note || ''),
  });
  res.status(201).json(row);
}

async function reviewWithdrawal(req, res) {
  if (req.userRole !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const row = await WithdrawalRequest.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Withdrawal request not found' });
  const nextStatus = String(req.body.status || '').toLowerCase();
  if (!['approved', 'rejected'].includes(nextStatus)) {
    return res.status(400).json({ message: 'status must be approved or rejected' });
  }
  row.status = nextStatus;
  row.reviewed_by = req.userId;
  row.reviewed_at = new Date();
  if (req.body.note != null) row.note = String(req.body.note);
  await row.save();
  const populated = await WithdrawalRequest.findById(row._id)
    .populate('instructor_id', 'name email')
    .populate('reviewed_by', 'name email');
  res.json(populated);
}

async function markOrderPaid(req, res) {
  const order = await Order.findById(req.params.id).populate('course_id', 'teacher_id');
  if (!order) return res.status(404).json({ message: 'Order not found' });

  const method = String(req.body.method || '').toLowerCase();
  const allowed = ['stripe', 'paypal', 'manual', 'evc_plus', 'zaad', 'sahal'];
  if (!allowed.includes(method)) return res.status(400).json({ message: 'Invalid payment method' });

  const settings = await getSettingsDoc();
  const enabled = Boolean(settings.payment?.methods?.[method]);
  if (!enabled) return res.status(400).json({ message: `${method} is disabled` });

  order.status = 'paid';
  order.instructor_id = order.instructor_id || order.course_id?.teacher_id || null;
  const instructorPercentage = await getInstructorPercentage();
  const split = calculateEarnings(order.amount, instructorPercentage);
  order.instructor_percentage = split.instructor_percentage;
  order.instructor_earning = split.instructor_earning;
  order.admin_earning = split.admin_earning;
  order.payment_provider = method === 'manual' ? 'manual' : 'online';
  order.payment_method = method;
  order.payment_status_detail = req.body.payment_status_detail ? String(req.body.payment_status_detail) : 'paid';
  order.paid_at = new Date();
  await order.save();

  if (order.coupon_code) {
    await Coupon.findOneAndUpdate(
      { code: order.coupon_code, used_count: { $lt: 9999999 } },
      { $inc: { used_count: 1 } }
    );
  }

  res.json({ message: 'Order marked as paid', order });
}

module.exports = {
  overview,
  listCoursePricing,
  updateCoursePricing,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  listWithdrawals,
  myWithdrawals,
  createWithdrawal,
  reviewWithdrawal,
  markOrderPaid,
};
