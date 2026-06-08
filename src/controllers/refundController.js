const Refund = require('../models/Refund');
const Enrollment = require('../models/Enrollment');

/* ── Student: request a refund ── */
async function requestRefund(req, res) {
  const { courseId, reason } = req.body;
  const studentId = req.user._id;

  if (!courseId || !reason || !String(reason).trim()) {
    return res.status(400).json({ message: 'courseId and reason are required' });
  }

  const enrollment = await Enrollment.findOne({ student_id: studentId, course_id: courseId }).lean();
  if (!enrollment) return res.status(404).json({ message: 'No enrollment found for this course' });
  if (enrollment.status !== 'approved') {
    return res.status(400).json({ message: 'Only approved enrollments can be refunded' });
  }

  const existing = await Refund.findOne({ student_id: studentId, course_id: courseId }).lean();
  if (existing) return res.status(409).json({ message: 'A refund request already exists for this course' });

  const refund = await Refund.create({
    student_id: studentId,
    course_id: courseId,
    enrollment_id: enrollment._id,
    amount: Number(enrollment.amount || 0),
    reason: String(reason).trim(),
  });

  const populated = await Refund.findById(refund._id)
    .populate('course_id', 'title thumbnail')
    .lean();
  res.status(201).json(populated);
}

/* ── Student: get my refunds ── */
async function getMyRefunds(req, res) {
  const refunds = await Refund.find({ student_id: req.user._id })
    .populate('course_id', 'title thumbnail')
    .sort({ createdAt: -1 })
    .lean();
  res.json(refunds);
}

/* ── Admin: list all refunds ── */
async function getAllRefunds(req, res) {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const total = await Refund.countDocuments(filter);
  const refunds = await Refund.find(filter)
    .populate('student_id', 'name email')
    .populate('course_id', 'title thumbnail')
    .populate('reviewed_by', 'name')
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  res.json({ total, page: Number(page), pages: Math.ceil(total / Number(limit)), refunds });
}

/* ── Admin: update refund status ── */
async function updateRefund(req, res) {
  const { id } = req.params;
  const { status, admin_note } = req.body;

  const allowed = ['approved', 'rejected', 'refunded'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${allowed.join(', ')}` });
  }

  const refund = await Refund.findById(id);
  if (!refund) return res.status(404).json({ message: 'Refund not found' });

  refund.status = status;
  if (admin_note !== undefined) refund.admin_note = String(admin_note || '').trim();
  refund.reviewed_by = req.user._id;
  refund.reviewed_at = new Date();
  await refund.save();

  const populated = await Refund.findById(refund._id)
    .populate('student_id', 'name email')
    .populate('course_id', 'title thumbnail')
    .populate('reviewed_by', 'name')
    .lean();
  res.json(populated);
}

/* ── Admin: analytics summary ── */
async function getRefundStats(req, res) {
  const [total, pending, approved, rejected, refunded] = await Promise.all([
    Refund.countDocuments(),
    Refund.countDocuments({ status: 'pending' }),
    Refund.countDocuments({ status: 'approved' }),
    Refund.countDocuments({ status: 'rejected' }),
    Refund.countDocuments({ status: 'refunded' }),
  ]);

  const amountAgg = await Refund.aggregate([
    { $match: { status: { $in: ['approved', 'refunded'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const totalRefunded = amountAgg[0]?.total || 0;

  res.json({ total, pending, approved, rejected, refunded, totalRefunded });
}

module.exports = { requestRefund, getMyRefunds, getAllRefunds, updateRefund, getRefundStats };
