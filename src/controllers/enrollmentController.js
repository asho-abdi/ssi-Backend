const Course = require('../models/Course');
const Progress = require('../models/Progress');
const { Enrollment } = require('../models/Enrollment');
const mongoose = require('mongoose');
const { getInstructorPercentage } = require('../utils/commission');
const { upsertPaidOrderForEnrollment } = require('../utils/earningsEligibility');

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
    return res.status(400).json({
      message: 'Enter a transaction ID or upload a payment screenshot (screenshot is optional if you provide a transaction ID)',
    });
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
    const instructorId = enrollment.course_id?.teacher_id || null;
    const excludeFromTeacherEarnings = Boolean(enrollment.exclude_from_teacher_earnings);
    await upsertPaidOrderForEnrollment({
      studentId: enrollment.student_id,
      courseId: enrollment.course_id,
      instructorId,
      amount: enrollment.amount,
      originalAmount: enrollment.amount,
      discountAmount: 0,
      instructorPercentage,
      excludeFromTeacherEarnings,
      paymentMethod: 'admin_manual_verification',
      paymentStatusDetail: excludeFromTeacherEarnings ? 'earnings_excluded' : 'offline_confirmed',
    });
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
  if (!enrollment) return res.json(null);
  const [enriched] = await enrichEnrollmentsWithProgress([enrollment]);
  res.json(enriched);
}

async function listAllEnrollments(_req, res) {
  const rows = await Enrollment.find({})
    .populate('student_id', 'name email')
    .populate('course_id', 'title pricing_type price sale_price')
    .populate('reviewed_by', 'name email')
    .populate('enrolled_by', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  const withProgress = await enrichEnrollmentsWithProgress(rows);
  res.json(withProgress);
}

async function manualEnroll(req, res) {
  if (req.userRole !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const { student_id, course_id, notes, exclude_from_teacher_earnings } = req.body || {};
  if (!student_id || !course_id) {
    return res.status(400).json({ message: 'student_id and course_id are required' });
  }
  const course = await Course.findById(course_id);
  if (!course) return res.status(404).json({ message: 'Course not found' });

  const amount = getCoursePrice(course);
  let enrollment = await Enrollment.findOne({ student_id, course_id });
  if (enrollment) {
    if (enrollment.status === 'approved') {
      return res.status(400).json({ message: 'Student already enrolled in this course' });
    }
    enrollment.status = 'approved';
    enrollment.enrollment_type = 'manual';
    enrollment.enrolled_by = req.userId;
    enrollment.notes = String(notes || '').trim();
    enrollment.approved_at = new Date();
    enrollment.exclude_from_teacher_earnings = Boolean(exclude_from_teacher_earnings);
    await enrollment.save();
  } else {
    enrollment = await Enrollment.create({
      student_id,
      course_id,
      amount,
      status: 'approved',
      enrollment_type: 'manual',
      enrolled_by: req.userId,
      notes: String(notes || '').trim(),
      approved_at: new Date(),
      exclude_from_teacher_earnings: Boolean(exclude_from_teacher_earnings),
    });
  }

  const instructorPercentage = await getInstructorPercentage();
  await upsertPaidOrderForEnrollment({
    studentId: student_id,
    courseId: course_id,
    instructorId: course.teacher_id || null,
    amount,
    originalAmount: amount,
    discountAmount: 0,
    instructorPercentage,
    excludeFromTeacherEarnings: Boolean(exclude_from_teacher_earnings),
    paymentMethod: 'admin_manual_enrollment',
    paymentStatusDetail: exclude_from_teacher_earnings ? 'earnings_excluded' : 'manual_enrollment',
  });

  const populated = await Enrollment.findById(enrollment._id)
    .populate('student_id', 'name email')
    .populate('course_id', 'title')
    .populate('enrolled_by', 'name email');
  res.status(201).json({ message: 'Manual enrollment created', enrollment: populated });
}

async function cancelEnrollment(req, res) {
  if (req.userRole !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const enrollment = await Enrollment.findById(req.params.id);
  if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });
  if (enrollment.status === 'cancelled') {
    return res.status(400).json({ message: 'Enrollment already cancelled' });
  }
  enrollment.status = 'cancelled';
  if (req.body?.notes != null) enrollment.notes = String(req.body.notes).trim();
  enrollment.reviewed_by = req.userId;
  enrollment.reviewed_at = new Date();
  await enrollment.save();
  res.json({ message: 'Enrollment cancelled', enrollment });
}

async function completeEnrollment(req, res) {
  if (req.userRole !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const enrollment = await Enrollment.findById(req.params.id);
  if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });
  if (enrollment.status !== 'approved') {
    return res.status(400).json({ message: 'Only approved enrollments can be marked completed' });
  }
  enrollment.status = 'completed';
  if (req.body?.notes != null) enrollment.notes = String(req.body.notes).trim();
  enrollment.reviewed_by = req.userId;
  enrollment.reviewed_at = new Date();
  await enrollment.save();
  res.json({ message: 'Enrollment marked completed', enrollment });
}

module.exports = {
  enrollCourse,
  submitPaymentProof,
  reviewEnrollment,
  getMyEnrollments,
  getMyEnrollmentByCourse,
  listAllEnrollments,
  manualEnroll,
  cancelEnrollment,
  completeEnrollment,
};
