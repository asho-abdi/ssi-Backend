const Order = require('../models/Order');
const Course = require('../models/Course');
const Coupon = require('../models/Coupon');
const { calculateEarnings, getInstructorPercentage } = require('../utils/commission');

function getCoursePrice(course) {
  const sale = Number(course?.sale_price || 0);
  const regular = Number(course?.price || 0);
  if (Number.isFinite(sale) && sale > 0 && sale < regular) return sale;
  return regular;
}

function applyCouponDiscount(baseAmount, coupon) {
  const amount = Number(baseAmount || 0);
  if (!coupon) return { amount, discount: 0 };
  if (coupon.discount_type === 'percentage') {
    const pct = Math.max(0, Math.min(100, Number(coupon.discount_value || 0)));
    const discount = (amount * pct) / 100;
    return { amount: Math.max(0, amount - discount), discount };
  }
  const fixed = Math.max(0, Number(coupon.discount_value || 0));
  return { amount: Math.max(0, amount - fixed), discount: Math.min(amount, fixed) };
}

function normalizePaidOrderSplit(order, defaultInstructorPercentage) {
  if (order.status !== 'paid') return order;
  const amount = Number(order.amount || 0);
  const storedPct = Number(order.instructor_percentage);
  const instructorAmount = Number(order.instructor_earning || 0);
  const adminAmount = Number(order.admin_earning || 0);
  const hasStoredSplit = instructorAmount > 0 || adminAmount > 0;
  const isLegacyAllAdminSplit =
    amount > 0 &&
    defaultInstructorPercentage > 0 &&
    storedPct === 0 &&
    instructorAmount === 0 &&
    Math.abs(adminAmount - amount) <= 0.01;
  const isLegacyZeroPctNoSplit = storedPct === 0 && amount > 0 && !hasStoredSplit && defaultInstructorPercentage > 0;
  const pctFromStoredSplit = amount > 0 ? (instructorAmount / amount) * 100 : NaN;
  const pct =
    Number.isFinite(storedPct) && storedPct >= 0 && storedPct <= 100 && !isLegacyAllAdminSplit && !isLegacyZeroPctNoSplit
      ? storedPct
      : Number.isFinite(pctFromStoredSplit) && pctFromStoredSplit >= 0 && pctFromStoredSplit <= 100 && !isLegacyAllAdminSplit
        ? Number(pctFromStoredSplit.toFixed(2))
        : defaultInstructorPercentage;
  return { ...order, ...calculateEarnings(amount, pct) };
}

async function createOrder(req, res) {
  const { course_id, coupon_code } = req.body;
  const course = await Course.findById(course_id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  const originalAmount = getCoursePrice(course);
  let coupon = null;
  if (coupon_code) {
    coupon = await Coupon.findOne({ code: String(coupon_code).trim().toUpperCase(), active: true });
    if (!coupon) return res.status(400).json({ message: 'Invalid coupon code' });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ message: 'Coupon expired' });
    }
    if (Number(coupon.used_count || 0) >= Number(coupon.usage_limit || 1)) {
      return res.status(400).json({ message: 'Coupon usage limit reached' });
    }
  }
  const pricing = applyCouponDiscount(originalAmount, coupon);
  const amount = Number(pricing.amount.toFixed(2));
  const discountAmount = Number(pricing.discount.toFixed(2));
  const normalizedCoupon = coupon ? coupon.code : '';
  let order = await Order.findOne({ user_id: req.userId, course_id });
  if (order) {
    if (order.status === 'paid') {
      return res.status(400).json({ message: 'Course already purchased' });
    }
    order.original_amount = originalAmount;
    order.discount_amount = discountAmount;
    order.amount = amount;
    order.coupon_code = normalizedCoupon;
    order.status = 'unpaid';
    order.payment_provider = '';
    order.payment_method = '';
    order.payment_intent_id = '';
    order.payment_status_detail = '';
    order.instructor_id = null;
    order.instructor_percentage = null;
    order.instructor_earning = 0;
    order.admin_earning = 0;
    order.paid_at = undefined;
    await order.save();
    return res.status(200).json(order);
  }
  order = await Order.create({
    user_id: req.userId,
    course_id,
    original_amount: originalAmount,
    discount_amount: discountAmount,
    amount,
    coupon_code: normalizedCoupon,
    status: 'unpaid',
  });
  res.status(201).json(order);
}

async function payOrder(req, res) {
  return res.status(503).json({
    message: 'Payments are temporarily disabled.',
  });
}

async function myOrders(req, res) {
  const defaultInstructorPercentage = await getInstructorPercentage();
  const orders = await Order.find({ user_id: req.userId })
    .populate('course_id')
    .sort({ createdAt: -1 })
    .lean();
  const normalized = orders.map((order) => normalizePaidOrderSplit(order, defaultInstructorPercentage));
  res.json(normalized);
}

async function allOrders(req, res) {
  const defaultInstructorPercentage = await getInstructorPercentage();
  const orders = await Order.find()
    .populate('course_id')
    .populate('user_id', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  const normalized = orders.map((order) => normalizePaidOrderSplit(order, defaultInstructorPercentage));
  res.json(normalized);
}

async function getOrder(req, res) {
  const defaultInstructorPercentage = await getInstructorPercentage();
  const order = await Order.findById(req.params.id)
    .populate('course_id')
    .populate('user_id', 'name email');
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (req.userRole !== 'admin' && order.user_id._id.toString() !== req.userId) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const normalized = normalizePaidOrderSplit(order.toObject(), defaultInstructorPercentage);
  res.json(normalized);
}

module.exports = {
  createOrder,
  payOrder,
  myOrders,
  allOrders,
  getOrder,
};
