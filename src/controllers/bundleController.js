const { CourseBundle, BUNDLE_STATUSES } = require('../models/CourseBundle');
const Course = require('../models/Course');
const { Enrollment } = require('../models/Enrollment');
const Order = require('../models/Order');
const { calculateEarnings, getInstructorPercentage } = require('../utils/commission');
const { upsertPaidOrderForEnrollment } = require('../utils/earningsEligibility');

function parsePagination(query) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  return { page, limit, skip: (page - 1) * limit };
}

async function listBundlesAdmin(req, res) {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status && BUNDLE_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const [total, rows] = await Promise.all([
    CourseBundle.countDocuments(filter),
    CourseBundle.find(filter)
      .populate('course_ids', 'title price sale_price thumbnail')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);
  res.json({ total, page, limit, pages: Math.ceil(total / limit), bundles: rows });
}

async function listBundlesPublic(_req, res) {
  const rows = await CourseBundle.find({ status: 'active' })
    .populate('course_ids', 'title thumbnail price sale_price')
    .sort({ featured: -1, createdAt: -1 })
    .lean();
  res.json(rows);
}

async function getBundle(req, res) {
  const row = await CourseBundle.findById(req.params.id)
    .populate({ path: 'course_ids', select: 'title thumbnail price sale_price pricing_type teacher_id', populate: { path: 'teacher_id', select: 'name' } })
    .lean();
  if (!row) return res.status(404).json({ message: 'Bundle not found' });
  if (req.userRole !== 'admin' && row.status !== 'active') {
    return res.status(404).json({ message: 'Bundle not found' });
  }
  res.json(row);
}

async function createBundle(req, res) {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  if (!title) return res.status(400).json({ message: 'title is required' });
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'price must be non-negative' });
  const status = body.status && BUNDLE_STATUSES.includes(body.status) ? body.status : 'draft';
  const courseIds = Array.isArray(body.course_ids) ? body.course_ids : [];
  if (courseIds.length) {
    const count = await Course.countDocuments({ _id: { $in: courseIds } });
    if (count !== courseIds.length) return res.status(400).json({ message: 'One or more courses not found' });
  }
  const row = await CourseBundle.create({
    title,
    description: String(body.description || '').trim(),
    image: String(body.image || '').trim(),
    course_ids: courseIds,
    price,
    status,
    featured: Boolean(body.featured),
  });
  const populated = await CourseBundle.findById(row._id).populate('course_ids', 'title price sale_price');
  res.status(201).json(populated);
}

async function updateBundle(req, res) {
  const row = await CourseBundle.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Bundle not found' });
  const body = req.body || {};
  if (body.title != null) row.title = String(body.title).trim();
  if (body.description != null) row.description = String(body.description).trim();
  if (body.image != null) row.image = String(body.image).trim();
  if (body.price != null) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Invalid price' });
    row.price = price;
  }
  if (body.status != null) {
    if (!BUNDLE_STATUSES.includes(body.status)) return res.status(400).json({ message: 'Invalid status' });
    row.status = body.status;
  }
  if (body.featured != null) row.featured = Boolean(body.featured);
  if (body.course_ids != null) {
    const courseIds = Array.isArray(body.course_ids) ? body.course_ids : [];
    if (courseIds.length) {
      const count = await Course.countDocuments({ _id: { $in: courseIds } });
      if (count !== courseIds.length) return res.status(400).json({ message: 'One or more courses not found' });
    }
    row.course_ids = courseIds;
  }
  await row.save();
  const populated = await CourseBundle.findById(row._id).populate('course_ids', 'title price sale_price');
  res.json(populated);
}

async function deleteBundle(req, res) {
  const row = await CourseBundle.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ message: 'Bundle not found' });
  res.json({ message: 'Bundle deleted' });
}

async function purchaseBundle(req, res) {
  const bundle = await CourseBundle.findById(req.params.id).populate('course_ids');
  if (!bundle || bundle.status !== 'active') {
    return res.status(404).json({ message: 'Bundle not available' });
  }
  const courseIds = (bundle.course_ids || []).map((c) => c._id || c).filter(Boolean);
  if (!courseIds.length) return res.status(400).json({ message: 'Bundle has no courses' });

  const body = req.body || {};
  const isAdmin = req.userRole === 'admin';

  // Students must provide payment info; admins auto-approve
  const paymentMethod = String(body.payment_method || 'manual').trim();
  const transactionId = String(body.transaction_id || '').trim();
  const paymentProofUrl = String(body.payment_proof_url || '').trim();

  if (!isAdmin && !transactionId && !paymentProofUrl) {
    return res.status(400).json({ message: 'Please provide a transaction ID or payment proof screenshot.' });
  }

  // For students: create pending_verification enrollments (admin reviews & approves)
  // For admins: auto-approve immediately
  const enrollmentStatus = isAdmin ? 'approved' : 'pending_verification';
  const instructorPercentage = await getInstructorPercentage();
  const enrollments = [];
  const perCourseAmount = Number((Number(bundle.price) / courseIds.length).toFixed(2));
  const bundleNote = `Bundle: ${bundle.title} (ID: ${bundle._id})`;

  for (const courseId of courseIds) {
    const course = bundle.course_ids.find((c) => String(c._id) === String(courseId)) || (await Course.findById(courseId));
    if (!course) continue;

    // Check if already enrolled & approved — skip to avoid duplicate
    let enrollment = await Enrollment.findOne({ student_id: req.userId, course_id: courseId });
    if (enrollment && (enrollment.status === 'approved' || enrollment.status === 'completed')) {
      enrollments.push(enrollment);
      continue;
    }

    if (!enrollment) {
      enrollment = await Enrollment.create({
        student_id: req.userId,
        course_id: courseId,
        amount: perCourseAmount,
        status: enrollmentStatus,
        enrollment_type: 'auto',
        transaction_id: transactionId || undefined,
        payment_proof_url: paymentProofUrl || undefined,
        notes: bundleNote,
        ...(isAdmin ? { approved_at: new Date() } : {}),
      });
    } else {
      enrollment.status = enrollmentStatus;
      enrollment.amount = perCourseAmount;
      enrollment.transaction_id = transactionId || enrollment.transaction_id;
      enrollment.payment_proof_url = paymentProofUrl || enrollment.payment_proof_url;
      enrollment.notes = bundleNote;
      if (isAdmin) enrollment.approved_at = new Date();
      await enrollment.save();
    }
    enrollments.push(enrollment);

    // Only create paid orders and earnings for admin (auto-approve) flow
    if (isAdmin) {
      let order = await Order.findOne({ user_id: req.userId, course_id: courseId });
      if (!order) {
        order = await Order.create({
          user_id: req.userId,
          course_id: courseId,
          original_amount: perCourseAmount,
          discount_amount: 0,
          amount: perCourseAmount,
          status: 'paid',
          payment_provider: 'bundle',
          payment_method: paymentMethod,
          payment_status_detail: `bundle:${bundle._id}`,
          paid_at: new Date(),
          instructor_id: course.teacher_id || null,
        });
      } else if (order.status !== 'paid') {
        order.original_amount = perCourseAmount;
        order.amount = perCourseAmount;
        order.status = 'paid';
        order.payment_provider = 'bundle';
        order.payment_method = paymentMethod;
        order.payment_status_detail = `bundle:${bundle._id}`;
        order.paid_at = new Date();
        order.instructor_id = course.teacher_id || null;
        await order.save();
      }

      const split = calculateEarnings(perCourseAmount, instructorPercentage);
      order.instructor_percentage = split.instructor_percentage;
      order.instructor_earning = split.instructor_earning;
      order.admin_earning = split.admin_earning;
      await order.save();

      await upsertPaidOrderForEnrollment({
        studentId: req.userId,
        courseId,
        instructorId: course.teacher_id || null,
        amount: perCourseAmount,
        originalAmount: perCourseAmount,
        discountAmount: 0,
        instructorPercentage,
        excludeFromTeacherEarnings: false,
        paymentMethod,
        paymentStatusDetail: `bundle:${bundle._id}`,
      });
    }
  }

  if (isAdmin) {
    bundle.sales_count = Number(bundle.sales_count || 0) + 1;
    await bundle.save();
  }

  res.status(201).json({
    message: isAdmin
      ? 'Bundle purchased and courses enrolled successfully.'
      : 'Bundle purchase submitted. Your enrollments are pending admin review.',
    bundle_id: bundle._id,
    status: enrollmentStatus,
    enrollments,
  });
}

module.exports = {
  listBundlesAdmin,
  listBundlesPublic,
  getBundle,
  createBundle,
  updateBundle,
  deleteBundle,
  purchaseBundle,
};
