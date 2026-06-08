const PDFDocument = require('pdfkit');
const { Enrollment, ENROLLMENT_STATUSES } = require('../models/Enrollment');
const Order = require('../models/Order');

function parsePagination(query) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit || 20)));
  return { page, limit, skip: (page - 1) * limit };
}

function parseDateRange(query) {
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if (to) to.setHours(23, 59, 59, 999);
  const dateFilter = {};
  if (from && !Number.isNaN(from.getTime())) dateFilter.$gte = from;
  if (to && !Number.isNaN(to.getTime())) dateFilter.$lte = to;
  return Object.keys(dateFilter).length ? dateFilter : null;
}

async function enrollmentReport(req, res) {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status && ENROLLMENT_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.course_id) filter.course_id = req.query.course_id;
  if (req.query.student_id) filter.student_id = req.query.student_id;
  if (req.query.enrollment_type) filter.enrollment_type = req.query.enrollment_type;
  const dateRange = parseDateRange(req.query);
  if (dateRange) filter.createdAt = dateRange;

  const [total, rows] = await Promise.all([
    Enrollment.countDocuments(filter),
    Enrollment.find(filter)
      .populate('student_id', 'name email')
      .populate('course_id', 'title')
      .populate('enrolled_by', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    enrollments: rows,
  });
}

async function paymentReport(req, res) {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.course_id) filter.course_id = req.query.course_id;
  if (req.query.user_id) filter.user_id = req.query.user_id;
  if (req.query.payment_method) filter.payment_method = req.query.payment_method;
  const dateRange = parseDateRange(req.query);
  if (dateRange) filter.paid_at = dateRange;

  const [total, rows, revenueAgg] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .populate('user_id', 'name email')
      .populate('course_id', 'title')
      .sort({ paid_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.aggregate([
      { $match: { ...filter, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    summary: {
      paid_count: revenueAgg[0]?.count || 0,
      paid_revenue: Number((revenueAgg[0]?.total || 0).toFixed(2)),
    },
    orders: rows,
  });
}

function streamPdfReport(res, title, headers, rows) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s+/g, '-').toLowerCase()}.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);
  doc.fontSize(18).text(title, { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`, { align: 'right' });
  doc.moveDown();

  const colWidth = (doc.page.width - 80) / headers.length;
  let y = doc.y;
  headers.forEach((h, i) => {
    doc.font('Helvetica-Bold').text(h, 40 + i * colWidth, y, { width: colWidth, continued: false });
  });
  doc.moveDown(0.5);
  rows.forEach((row) => {
    if (doc.y > doc.page.height - 60) doc.addPage();
    y = doc.y;
    row.forEach((cell, i) => {
      doc.font('Helvetica').text(String(cell ?? ''), 40 + i * colWidth, y, { width: colWidth, continued: false });
    });
    doc.moveDown(0.3);
  });
  doc.end();
}

async function exportEnrollmentReportPdf(req, res) {
  const filter = {};
  if (req.query.status && ENROLLMENT_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.course_id) filter.course_id = req.query.course_id;
  const dateRange = parseDateRange(req.query);
  if (dateRange) filter.createdAt = dateRange;

  const rows = await Enrollment.find(filter)
    .populate('student_id', 'name email')
    .populate('course_id', 'title')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const tableRows = rows.map((r) => [
    r.student_id?.name || r.student_id?.email || '—',
    r.course_id?.title || '—',
    r.status,
    r.enrollment_type || 'auto',
    r.amount ?? 0,
    r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '—',
  ]);

  streamPdfReport(res, 'Enrollment Report', ['Student', 'Course', 'Status', 'Type', 'Amount', 'Date'], tableRows);
}

async function exportPaymentReportPdf(req, res) {
  const filter = { status: 'paid' };
  if (req.query.course_id) filter.course_id = req.query.course_id;
  if (req.query.user_id) filter.user_id = req.query.user_id;
  const dateRange = parseDateRange(req.query);
  if (dateRange) filter.paid_at = dateRange;

  const rows = await Order.find(filter)
    .populate('user_id', 'name email')
    .populate('course_id', 'title')
    .sort({ paid_at: -1 })
    .limit(500)
    .lean();

  const tableRows = rows.map((r) => [
    r.user_id?.name || r.user_id?.email || '—',
    r.course_id?.title || '—',
    r.amount ?? 0,
    r.payment_method || '—',
    r.paid_at ? new Date(r.paid_at).toISOString().slice(0, 10) : '—',
  ]);

  streamPdfReport(res, 'Payment Report', ['Student', 'Course', 'Amount', 'Method', 'Paid Date'], tableRows);
}

module.exports = {
  enrollmentReport,
  paymentReport,
  exportEnrollmentReportPdf,
  exportPaymentReportPdf,
};
