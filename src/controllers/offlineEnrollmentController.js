const OfflineEnrollment = require('../models/OfflineEnrollment');
const Course = require('../models/Course');

async function createOfflineEnrollment(req, res) {
  const { fullName, email, phone, courseId, schedule, paymentMethod, notes } = req.body;
  if (!fullName || !email || !phone || !courseId) {
    return res.status(400).json({ message: 'fullName, email, phone, and courseId are required' });
  }

  const course = await Course.findById(courseId).select('title price sale_price').lean();
  if (!course) return res.status(404).json({ message: 'Course not found' });

  const price =
    course.sale_price && course.sale_price > 0 && course.sale_price < course.price
      ? course.sale_price
      : course.price || 0;

  const enrollment = await OfflineEnrollment.create({
    fullName: String(fullName).trim(),
    email: String(email).trim().toLowerCase(),
    schedule: schedule ? String(schedule).trim() : '',
    paymentMethod: paymentMethod || 'cash',
    notes: notes ? String(notes).trim() : '',
    phone: String(phone).trim(),
    courseId: course._id,
    courseTitle: course.title,
    price,
  });

  return res.status(201).json(enrollment);
}

async function getOfflineEnrollments(req, res) {
  const { search, courseId } = req.query;
  const filter = {};
  if (courseId) filter.courseId = courseId;
  if (search) {
    const q = new RegExp(String(search).trim(), 'i');
    filter.$or = [{ fullName: q }, { email: q }, { phone: q }];
  }

  const enrollments = await OfflineEnrollment.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  return res.json(enrollments);
}

async function updateOfflineEnrollment(req, res) {
  const { id } = req.params;
  const { status, paymentStatus } = req.body;

  const enrollment = await OfflineEnrollment.findById(id);
  if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });

  if (status && ['registered', 'attended'].includes(status)) {
    enrollment.status = status;
  }
  if (paymentStatus && ['pending', 'paid'].includes(paymentStatus)) {
    enrollment.paymentStatus = paymentStatus;
  }

  await enrollment.save();
  return res.json(enrollment);
}

module.exports = { createOfflineEnrollment, getOfflineEnrollments, updateOfflineEnrollment };
