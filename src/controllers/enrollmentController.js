const Course = require('../models/Course');
const Progress = require('../models/Progress');
const Order = require('../models/Order');
const { Enrollment } = require('../models/Enrollment');
const mongoose = require('mongoose');
const { calculateEarnings, getInstructorPercentage } = require('../utils/commission');

function getCoursePrice(course) {
  const sale = Number(course?.sale_price || 0);
  const regular = Number(course?.price || 0);
  if (Number.isFinite(sale) && sale > 0 && sale < regular) return sale;
  return regular;
}

function isPaidCourse(course) {
  if (String(course?.pricing_type || '').toLowerCase() === 'paid') return true;
  return Number(getCoursePrice(course)) > 0;
}

function progressLabel(value) {
  const pct = Number(value || 0);
  if (pct >= 100) return 'Completed';
  if (pct > 0) return 'In Progress';
  return 'Not Started';
}

async function enrichEnrollmentsWithProgress(enrollments) {
  const approved = enrollments.filter((row) => row.status === 'approved');
  const courseIds = approved.map((row) => row.course_id?._id || row.course_id).filter(Boolean);
  const studentIds = approved.map((row) => row.student_id?._id || row.student_id).filter(Boolean);
  const progressRows =
    courseIds.length && studentIds.length
      ? await Progress.find({ course_id: { $in: courseIds }, user_id: { $in: studentIds } }).lean()
      : [];
  const progressMap = new Map(progressRows.map((row) => [`${row.user_id}-${row.course_id}`, row]));

  return enrollments.map((row) => {
    const studentId = String(row.student_id?._id || row.student_id || '');
    const courseId = String(row.course_id?._id || row.course_id || '');
    const progress = progressMap.get(`${studentId}-${courseId}`);
    const progress_percentage = Number(progress?.progress_percentage || 0);
    return {
      ...row,
      progress_percentage: row.status === 'approved' ? progress_percentage : 0,
      progress_status: row.status === 'approved' ? progressLabel(progress_percentage) : null,
    };
  });
}

async function enrollCourse(req, res) {
  const { course_id } = req.body || {};
  if (!course_id) return res.status(400).json({ message: 'course_id is required' });
  const course = await Course.findById(course_id);
  if (!course) return res.status(404).json({ message: 'Course not found' });

  const amount = getCoursePrice(course);
  const paidCourse = isPaidCourse(course);
  let enrollment = await Enrollment.findOne({ student_id: req.userId, course_id: course_id });

  if (enrollment) {
    if (enrollment.status === 'approved') {
      return res.status(200).json({ message: 'Already enrolled', enrollment });
    }
    enrollment.amount = amount;
    if (paidCourse) {
      enrollment.status = 'pending';
      enrollment.payment_proof_url = '';
      enrollment.transaction_id = '';
      enrollment.admin_note = '';
      enrollment.reviewed_by = null;
      enrollment.reviewed_at = null;
      enrollment.approved_at = null;
    } else {
      enrollment.status = 'approved';
      enrollment.approved_at = new Date();
    }
    await enrollment.save();
    return res.status(200).json({
      message: paidCourse ? 'Enrollment created. Submit payment proof to continue.' : 'Enrollment completed',
      enrollment,
    });
  }

  enrollment = await Enrollment.create({
    student_id: req.userId,
    course_id: course_id,
    amount,
    status: paidCourse ? 'pending' : 'approved',
    approved_at: paidCourse ? null : new Date(),
  });

  return res.status(201).json({
    message: paidCourse ? 'Enrollment created. Submit payment proof to continue.' : 'Enrollment completed',
    enrollment,
  });
}

async function submitPaymentProof(req, res) {
  const enrollment = await Enrollment.findById(req.params.id);
  if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });
  if (String(enrollment.student_id) !== String(req.userId) && req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (enrollment.status === 'approved') {
    return res.status(400).json({ message: 'Enrollment already approved' });
  }

  const paymentProof = String(req.body?.payment_proof_url || '').trim();
  const transactionId = String(req.body?.transaction_id || '').trim();
  if (!paymentProof && !transactionId) {
    return res.status(400).json({ message: 'payment_proof_url or transaction_id is required' });
  }

  enrollment.payment_proof_url = paymentProof;
  enrollment.transaction_id = transactionId;
  enrollment.status = 'pending_verification';
  enrollment.admin_note = '';
  enrollment.reviewed_by = null;
  enrollment.reviewed_at = null;
  await enrollment.save();

  res.json({ message: 'Payment proof submitted. Awaiting verification.', enrollment });
}

async function reviewEnrollment(req, res) {
  if (req.userRole !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const enrollment = await Enrollment.findById(req.params.id).populate('course_id', 'title teacher_id');
  if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });

  const action = String(req.body?.action || '').toLowerCase();
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'action must be approve or reject' });
  }
  if (action === 'approve') {
    enrollment.status = 'approved';
    enrollment.approved_at = new Date();
  } else {
    enrollment.status = 'rejected';
    enrollment.approved_at = null;
  }
  enrollment.admin_note = String(req.body?.admin_note || '');
  enrollment.reviewed_by = req.userId;
  enrollment.reviewed_at = new Date();
  await enrollment.save();

  if (action === 'approve') {
    const instructorPercentage = await getInstructorPercentage();
    const earnings = calculateEarnings(enrollment.amount, instructorPercentage);
    const instructorId = enrollment.course_id?.teacher_id || null;
    const existingOrder = await Order.findOne({ user_id: enrollment.student_id, course_id: enrollment.course_id });
    if (!existingOrder) {
      await Order.create({
        user_id: enrollment.student_id,
        course_id: enrollment.course_id,
        instructor_id: instructorId,
        original_amount: enrollment.amount,
        discount_amount: 0,
        amount: enrollment.amount,
        ...earnings,
        status: 'paid',
        payment_provider: 'manual',
        payment_method: 'admin_manual_verification',
        payment_status_detail: 'offline_confirmed',
        paid_at: new Date(),
      });
    } else if (existingOrder.status !== 'paid') {
      existingOrder.instructor_id = existingOrder.instructor_id || instructorId;
      existingOrder.instructor_percentage = earnings.instructor_percentage;
      existingOrder.instructor_earning = earnings.instructor_earning;
      existingOrder.admin_earning = earnings.admin_earning;
      existingOrder.status = 'paid';
      existingOrder.payment_provider = 'manual';
      existingOrder.payment_method = 'admin_manual_verification';
      existingOrder.payment_status_detail = 'offline_confirmed';
      existingOrder.paid_at = new Date();
      await existingOrder.save();
    }
  }

  res.json({
    message: action === 'approve' ? 'Enrollment approved' : 'Enrollment rejected',
    enrollment,
  });
}

async function getMyEnrollments(req, res) {
  const rows = await Enrollment.find({ student_id: req.userId })
    .populate('course_id', 'title thumbnail pricing_type price sale_price lessons')
    .sort({ createdAt: -1 })
    .lean();
  const withProgress = await enrichEnrollmentsWithProgress(rows);
  res.json(withProgress);
}

async function getMyEnrollmentByCourse(req, res) {
  const { courseId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: 'Invalid course id' });
  }
  const enrollment = await Enrollment.findOne({ student_id: req.userId, course_id: courseId })
    .populate('course_id', 'title thumbnail pricing_type price sale_price lessons')
    .lean();
  if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });
  const [enriched] = await enrichEnrollmentsWithProgress([enrollment]);
  res.json(enriched);
}

async function listAllEnrollments(_req, res) {
  const rows = await Enrollment.find({})
    .populate('student_id', 'name email')
    .populate('course_id', 'title pricing_type price sale_price')
    .populate('reviewed_by', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  const withProgress = await enrichEnrollmentsWithProgress(rows);
  res.json(withProgress);
}

module.exports = {
  enrollCourse,
  submitPaymentProof,
  reviewEnrollment,
  getMyEnrollments,
  getMyEnrollmentByCourse,
  listAllEnrollments,
};
