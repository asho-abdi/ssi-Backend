const User = require('../models/User');
const { ROLES } = require('../models/User');
const Course = require('../models/Course');
const Order = require('../models/Order');
const { Enrollment } = require('../models/Enrollment');
const Progress = require('../models/Progress');
const Review = require('../models/Review');
const { calculateEarnings, getInstructorPercentage } = require('../utils/commission');
const { normalizePermissions } = require('../utils/permissions');
const { logAuditEvent } = require('../utils/auditLog');
const { safeDeleteFile } = require('../services/imagekitMedia');

function normalizeAdminUserRow(row) {
  const avatarUrl =
    row?.avatar_url ||
    row?.avatarUrl ||
    row?.profileImage ||
    row?.profile_image ||
    row?.profile?.avatarUrl ||
    row?.profile?.avatar_url ||
    row?.avatar ||
    '';
  return {
    ...row,
    avatar_url: avatarUrl,
    permissions: normalizePermissions(row?.permissions, row?.role),
  };
}

async function listUsers(req, res) {
  const role = req.query.role ? String(req.query.role).toLowerCase() : '';
  const query = {};
  if (role && role !== 'all') {
    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role filter' });
    }
    query.role = role;
  }
  const users = await User.find(query)
    .select('name email role teacher_fee phone bio avatar_url avatarUrl profileImage profile_image avatar profile permissions createdAt')
    .sort({ createdAt: -1 })
    .lean();
  res.json(users.map((row) => normalizeAdminUserRow(row)));
}

async function listUsersGroupedByRole(_req, res) {
  const users = await User.find({ role: { $in: ['student', 'teacher', 'editor', 'admin'] } })
    .select('name email role teacher_fee phone bio avatar_url avatarUrl profileImage profile_image avatar profile permissions createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const grouped = {
    students: [],
    teachers: [],
    editors: [],
    admins: [],
  };

  for (const user of users) {
    const normalizedUser = normalizeAdminUserRow(user);
    if (user.role === 'student') grouped.students.push(normalizedUser);
    if (user.role === 'teacher') grouped.teachers.push(normalizedUser);
    if (user.role === 'editor') grouped.editors.push(normalizedUser);
    if (user.role === 'admin') grouped.admins.push(normalizedUser);
  }

  res.json(grouped);
}

async function listUsersByRole(req, res) {
  const role = String(req.params.role || '').toLowerCase();
  if (!ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role filter' });
  }
  const users = await User.find({ role })
    .select('name email role teacher_fee phone bio avatar_url avatarUrl profileImage profile_image avatar profile permissions createdAt')
    .sort({ createdAt: -1 })
    .lean();
  res.json(users.map((row) => normalizeAdminUserRow(row)));
}

async function createUserByAdmin(req, res) {
  const { name, email, role, password, teacher_fee, permissions } = req.body;
  if (!name || !email || !role || !password) {
    return res.status(400).json({ message: 'name, email, role and password are required' });
  }
  const allowedRoles = ['student', 'teacher', 'editor'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Admin can only create student, teacher, or editor accounts here' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = await User.findOne({ email: normalizedEmail });
  if (exists) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  const initialPassword = String(password).trim();
  if (initialPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  let normalizedTeacherFee = 0;
  if (role === 'teacher') {
    const fee = teacher_fee != null ? Number(teacher_fee) : 0;
    if (!Number.isFinite(fee) || fee < 0) {
      return res.status(400).json({ message: 'teacher_fee must be a non-negative number' });
    }
    normalizedTeacherFee = fee;
  }

  const supportsCustomPermissions = ['teacher', 'editor'].includes(role);
  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    role,
    password: initialPassword,
    teacher_fee: normalizedTeacherFee,
    permissions: supportsCustomPermissions ? normalizePermissions(permissions, role) : undefined,
  });

  await logAuditEvent(req, {
    action: 'admin.user_create',
    target_type: 'user',
    target_id: user._id,
    details: { role: user.role, email: user.email },
  });

  res.status(201).json({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      teacher_fee: user.teacher_fee || 0,
      phone: user.phone || '',
      bio: user.bio || '',
      avatar_url: user.avatar_url || '',
      permissions: normalizePermissions(user.permissions, user.role),
    },
    credentials: { email: user.email },
  });
}

async function updateUserRole(req, res) {
  const { id } = req.params;
  const { role } = req.body;
  if (!ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  const supportsCustomPermissions = ['teacher', 'editor'].includes(role);
  const user = await User.findByIdAndUpdate(
    id,
    { role, permissions: supportsCustomPermissions ? normalizePermissions(undefined, role) : undefined },
    { new: true }
  );
  if (!user) return res.status(404).json({ message: 'User not found' });
  await logAuditEvent(req, {
    action: 'admin.user_role_update',
    target_type: 'user',
    target_id: user._id,
    details: { role: user.role },
  });
  res.json({ ...user.toObject(), permissions: normalizePermissions(user.permissions, user.role) });
}

async function updateUser(req, res) {
  const { id } = req.params;
  const { name, email, role, teacher_fee, permissions } = req.body || {};
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (id === req.userId && role && role !== user.role) {
    return res.status(400).json({ message: 'Cannot change your own role' });
  }

  if (name != null) {
    const trimmedName = String(name).trim();
    if (!trimmedName) return res.status(400).json({ message: 'Name is required' });
    user.name = trimmedName;
  }

  if (email != null) {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ message: 'Email is required' });
    const conflict = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } }).lean();
    if (conflict) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    user.email = normalizedEmail;
  }

  if (role != null) {
    const normalizedRole = String(role).toLowerCase();
    const allowedRoles = ['student', 'teacher', 'editor', 'admin'];
    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    user.role = normalizedRole;
  }

  const supportsCustomPermissions = ['teacher', 'editor'].includes(user.role);

  if (permissions != null && supportsCustomPermissions) {
    user.permissions = normalizePermissions(permissions, user.role);
  } else if (role != null && supportsCustomPermissions) {
    user.permissions = normalizePermissions(user.permissions, user.role);
  } else if (!supportsCustomPermissions) {
    user.permissions = undefined;
  }

  if (teacher_fee != null) {
    const fee = Number(teacher_fee);
    if (!Number.isFinite(fee) || fee < 0) {
      return res.status(400).json({ message: 'teacher_fee must be a non-negative number' });
    }
    user.teacher_fee = fee;
  }

  await user.save();
  await logAuditEvent(req, {
    action: 'admin.user_update',
    target_type: 'user',
    target_id: user._id,
    details: { role: user.role, email: user.email },
  });
  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    teacher_fee: user.teacher_fee || 0,
    phone: user.phone || '',
    bio: user.bio || '',
    avatar_url: user.avatar_url || '',
    permissions: normalizePermissions(user.permissions, user.role),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}

async function grantCourseAccess(req, res) {
  const { id } = req.params;
  const { course_id, amount } = req.body;
  if (!course_id) {
    return res.status(400).json({ message: 'course_id is required' });
  }

  const student = await User.findById(id);
  if (!student) return res.status(404).json({ message: 'Student not found' });
  if (student.role !== 'student') {
    return res.status(400).json({ message: 'Course access can only be granted to student accounts' });
  }

  const course = await Course.findById(course_id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!course.teacher_id) {
    return res.status(400).json({ message: 'Course has no assigned instructor' });
  }

  const finalAmount = amount != null ? Number(amount) : Number(course.price);
  if (!Number.isFinite(finalAmount) || finalAmount < 0) {
    return res.status(400).json({ message: 'amount must be a valid non-negative number' });
  }
  const originalAmount = Number.isFinite(Number(course.price)) ? Number(course.price) : finalAmount;
  const discountAmount = Math.max(0, Number((originalAmount - finalAmount).toFixed(2)));
  const instructorPercentage = await getInstructorPercentage();
  const split = calculateEarnings(finalAmount, instructorPercentage);

  let order = await Order.findOne({ user_id: student._id, course_id: course._id });
  if (!order) {
    order = await Order.create({
      user_id: student._id,
      course_id: course._id,
      instructor_id: course.teacher_id,
      original_amount: originalAmount,
      discount_amount: discountAmount,
      amount: finalAmount,
      instructor_percentage: split.instructor_percentage,
      instructor_earning: split.instructor_earning,
      admin_earning: split.admin_earning,
      status: 'paid',
      payment_provider: 'manual',
      payment_method: 'admin_manual',
      payment_status_detail: 'offline_confirmed',
      paid_at: new Date(),
    });
  } else {
    order.instructor_id = course.teacher_id;
    order.original_amount = originalAmount;
    order.discount_amount = discountAmount;
    order.amount = finalAmount;
    order.instructor_percentage = split.instructor_percentage;
    order.instructor_earning = split.instructor_earning;
    order.admin_earning = split.admin_earning;
    order.status = 'paid';
    order.payment_provider = 'manual';
    order.payment_method = 'admin_manual';
    order.payment_status_detail = 'offline_confirmed';
    order.paid_at = new Date();
    await order.save();
  }

  let enrollment = await Enrollment.findOne({ student_id: student._id, course_id: course._id });
  if (!enrollment) {
    enrollment = await Enrollment.create({
      student_id: student._id,
      course_id: course._id,
      amount: finalAmount,
      status: 'approved',
      admin_note: 'Granted by admin',
      reviewed_by: req.userId,
      reviewed_at: new Date(),
      approved_at: new Date(),
    });
  } else {
    enrollment.amount = finalAmount;
    enrollment.status = 'approved';
    enrollment.admin_note = 'Granted by admin';
    enrollment.reviewed_by = req.userId;
    enrollment.reviewed_at = new Date();
    enrollment.approved_at = new Date();
    await enrollment.save();
  }

  await logAuditEvent(req, {
    action: 'admin.grant_course_access',
    target_type: 'user',
    target_id: student._id,
    details: { course_id: course._id, order_id: order._id, amount: finalAmount },
  });
  res.json({
    message: `Access granted to ${student.name} for "${course.title}"`,
    order,
    enrollment,
  });
}

async function deleteUser(req, res) {
  const { id } = req.params;
  if (id === req.userId) {
    return res.status(400).json({ message: 'Cannot delete your own account' });
  }
  const user = await User.findByIdAndDelete(id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.avatar_file_id) {
    await safeDeleteFile(user.avatar_file_id);
  }
  await logAuditEvent(req, {
    action: 'admin.user_delete',
    target_type: 'user',
    target_id: user._id,
    details: { role: user.role, email: user.email },
  });
  res.json({ message: 'User removed' });
}

function countCompletedLessons(course, completedLessonIds) {
  if (!Array.isArray(course?.lessons) || course.lessons.length === 0) return 0;
  const completedSet = new Set((completedLessonIds || []).map((id) => id.toString()));
  return course.lessons.reduce((total, lesson) => {
    if (completedSet.has(String(lesson._id))) return total + 1;
    return total;
  }, 0);
}

async function getStudentReport(req, res) {
  const { id } = req.params;
  const student = await User.findById(id).select('name email role createdAt').lean();
  if (!student) return res.status(404).json({ message: 'Student not found' });
  if (student.role !== 'student') {
    return res.status(400).json({ message: 'Report is only available for student accounts' });
  }

  const [orders, progressRows, reviewsPlaced] = await Promise.all([
    Order.find({ user_id: id, status: 'paid' })
      .populate('course_id', 'title lessons quizzes assignments')
      .sort({ createdAt: -1 })
      .lean(),
    Progress.find({ user_id: id }).lean(),
    Review.countDocuments({ user_id: id }),
  ]);

  const progressByCourse = new Map(progressRows.map((p) => [String(p.course_id), p]));

  const courses = [];
  let totalLessons = 0;
  let totalQuizzes = 0;
  let totalAssignments = 0;
  let totalQuestions = 0;
  let completedCourses = 0;
  let inProgressCourses = 0;

  for (const order of orders) {
    const course = order.course_id;
    if (!course?._id) continue;
    const courseId = String(course._id);
    const progress = progressByCourse.get(courseId);
    const progressPercentage = Number(progress?.progress_percentage || 0);

    const lessonTotal = Array.isArray(course.lessons) ? course.lessons.length : 0;
    const lessonsCompleted = countCompletedLessons(course, progress?.completed_lesson_ids || []);
    const quizzesTotal = Array.isArray(course.quizzes) ? course.quizzes.length : 0;
    const assignmentsTotal = Array.isArray(course.assignments) ? course.assignments.length : 0;
    const questionsTotal = Array.isArray(course.quizzes)
      ? course.quizzes.reduce((sum, quiz) => sum + (Array.isArray(quiz.questions) ? quiz.questions.length : 0), 0)
      : 0;

    totalLessons += lessonTotal;
    totalQuizzes += quizzesTotal;
    totalAssignments += assignmentsTotal;
    totalQuestions += questionsTotal;

    if (progressPercentage >= 100) completedCourses += 1;
    if (progressPercentage > 0 && progressPercentage < 100) inProgressCourses += 1;

    courses.push({
      order_id: order._id,
      course_id: course._id,
      course_title: course.title || 'Course',
      enrolled_at: order.paid_at || order.createdAt,
      lessons_completed: lessonsCompleted,
      lessons_total: lessonTotal,
      quizzes_total: quizzesTotal,
      assignments_total: assignmentsTotal,
      questions_total: questionsTotal,
      progress_percentage: progressPercentage,
    });
  }

  res.json({
    student,
    stats: {
      enrolled_courses: courses.length,
      completed_courses: completedCourses,
      in_progress_courses: inProgressCourses,
      reviews_placed: reviewsPlaced,
      total_lessons: totalLessons,
      quizzes_taken: totalQuizzes,
      assignments: totalAssignments,
      questions: totalQuestions,
    },
    courses,
  });
}

module.exports = {
  listUsers,
  listUsersGroupedByRole,
  listUsersByRole,
  getStudentReport,
  createUserByAdmin,
  updateUser,
  updateUserRole,
  grantCourseAccess,
  deleteUser,
};
