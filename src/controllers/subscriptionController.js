const SubscriptionPlan = require('../models/SubscriptionPlan');
const { UserSubscription, SUBSCRIPTION_STATUSES } = require('../models/UserSubscription');
const Course = require('../models/Course');
const { Enrollment } = require('../models/Enrollment');

function addBillingPeriod(start, billingCycle) {
  const d = new Date(start);
  if (billingCycle === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (billingCycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else if (billingCycle === 'lifetime' || billingCycle === 'corporate') return null;
  else d.setMonth(d.getMonth() + 1);
  return d;
}

async function listPlansPublic(_req, res) {
  const plans = await SubscriptionPlan.find({ active: true })
    .populate('course_ids', 'title thumbnail')
    .sort({ price: 1 })
    .lean();
  res.json(plans);
}

async function mySubscriptions(req, res) {
  const rows = await UserSubscription.find({ user_id: req.userId })
    .populate('plan_id')
    .sort({ createdAt: -1 })
    .lean();
  res.json(rows);
}

async function subscribe(req, res) {
  const { plan_id, payment_method } = req.body || {};
  if (!plan_id) return res.status(400).json({ message: 'plan_id is required' });
  const plan = await SubscriptionPlan.findById(plan_id);
  if (!plan || !plan.active) return res.status(404).json({ message: 'Plan not found or inactive' });

  const existing = await UserSubscription.findOne({
    user_id: req.userId,
    plan_id,
    status: 'active',
  });
  if (existing) return res.status(400).json({ message: 'Already subscribed to this plan' });

  const startsAt = new Date();
  const expiresAt = addBillingPeriod(startsAt, plan.billing_cycle);

  const sub = await UserSubscription.create({
    user_id: req.userId,
    plan_id,
    status: 'active',
    starts_at: startsAt,
    expires_at: expiresAt,
    renewal_at: expiresAt,
    payment_method: String(payment_method || '').trim(),
    amount_paid: Number(plan.price || 0),
  });

  const courseFilter =
    plan.access_scope === 'selected_courses' && plan.course_ids?.length
      ? { _id: { $in: plan.course_ids } }
      : {};
  const courses = await Course.find(courseFilter).select('_id price sale_price').lean();
  for (const course of courses) {
    const existingEnrollment = await Enrollment.findOne({ student_id: req.userId, course_id: course._id });
    if (!existingEnrollment) {
      await Enrollment.create({
        student_id: req.userId,
        course_id: course._id,
        amount: 0,
        status: 'approved',
        enrollment_type: 'auto',
        approved_at: new Date(),
        notes: `subscription:${sub._id}`,
      });
    } else if (existingEnrollment.status !== 'approved' && existingEnrollment.status !== 'completed') {
      existingEnrollment.status = 'approved';
      existingEnrollment.approved_at = new Date();
      await existingEnrollment.save();
    }
  }

  const populated = await UserSubscription.findById(sub._id).populate('plan_id');
  res.status(201).json({ message: 'Subscribed', subscription: populated });
}

async function cancelSubscription(req, res) {
  const sub = await UserSubscription.findOne({ _id: req.params.id, user_id: req.userId });
  if (!sub) return res.status(404).json({ message: 'Subscription not found' });
  if (sub.status === 'cancelled') return res.status(400).json({ message: 'Subscription already cancelled' });
  sub.status = 'cancelled';
  sub.cancelled_at = new Date();
  await sub.save();
  res.json({ message: 'Subscription cancelled', subscription: sub });
}

async function listSubscriptionsAdmin(req, res) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const filter = {};
  if (req.query.status && SUBSCRIPTION_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.plan_id) filter.plan_id = req.query.plan_id;

  const [total, rows] = await Promise.all([
    UserSubscription.countDocuments(filter),
    UserSubscription.find(filter)
      .populate('user_id', 'name email')
      .populate('plan_id', 'name billing_cycle price')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  res.json({ total, page, limit, pages: Math.ceil(total / limit), subscriptions: rows });
}

async function subscriptionAnalytics(_req, res) {
  const [total, active, expired, cancelled, pending, revenueAgg, byPlan] = await Promise.all([
    UserSubscription.countDocuments(),
    UserSubscription.countDocuments({ status: 'active' }),
    UserSubscription.countDocuments({ status: 'expired' }),
    UserSubscription.countDocuments({ status: 'cancelled' }),
    UserSubscription.countDocuments({ status: 'pending' }),
    UserSubscription.aggregate([{ $group: { _id: null, total: { $sum: '$amount_paid' } } }]),
    UserSubscription.aggregate([
      { $group: { _id: '$plan_id', count: { $sum: 1 }, revenue: { $sum: '$amount_paid' } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const planIds = byPlan.map((r) => r._id).filter(Boolean);
  const plans = planIds.length
    ? await SubscriptionPlan.find({ _id: { $in: planIds } }).select('name billing_cycle price').lean()
    : [];
  const planMap = Object.fromEntries(plans.map((p) => [String(p._id), p]));

  res.json({
    totals: {
      subscriptions: total,
      active,
      expired,
      cancelled,
      pending,
      revenue: Number((revenueAgg[0]?.total || 0).toFixed(2)),
    },
    by_plan: byPlan.map((row) => ({
      plan_id: row._id,
      plan_name: planMap[String(row._id)]?.name || 'Plan',
      billing_cycle: planMap[String(row._id)]?.billing_cycle || '',
      count: row.count,
      revenue: Number((row.revenue || 0).toFixed(2)),
    })),
  });
}

module.exports = {
  listPlansPublic,
  mySubscriptions,
  subscribe,
  cancelSubscription,
  listSubscriptionsAdmin,
  subscriptionAnalytics,
};
