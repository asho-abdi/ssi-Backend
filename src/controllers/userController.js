const User = require('../models/User');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { ROLES } = require('../models/User');
const Course = require('../models/Course');
const Order = require('../models/Order');
const { Enrollment } = require('../models/Enrollment');
const Progress = require('../models/Progress');
const Review = require('../models/Review');
const { calculateEarnings, getInstructorPercentage } = require('../utils/commission');
const { earningsEligiblePaidOrderQuery } = require('../utils/earningsEligibility');
const {
  parseExcludeFromTeacherEarnings,
  upsertPaidOrderForEnrollment,
} = require('../utils/earningsEligibility');
const { normalizePermissions } = require('../utils/permissions');
const { logAuditEvent } = require('../utils/auditLog');

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
  const passwordError = validatePasswordStrength(initialPassword);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
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
  const { name, email, role, teacher_fee, permissions, avatar_url, phone, bio } = req.body || {};
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

  if (avatar_url != null) user.avatar_url = String(avatar_url).trim();
  if (phone != null) user.phone = String(phone).trim();
  if (bio != null) user.bio = String(bio).trim();

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
    account_status: user.account_status || 'active',
    permissions: normalizePermissions(user.permissions, user.role),
    instructor_settings: user.instructor_settings,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}

async function grantCourseAccess(req, res) {
  const { id } = req.params;
  const { course_id, amount, exclude_from_teacher_earnings: excludeFromTeacherEarningsRaw } = req.body;
  const excludeFromTeacherEarnings = parseExcludeFromTeacherEarnings(excludeFromTeacherEarningsRaw);
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

  let enrollment = await Enrollment.findOne({ student_id: student._id, course_id: course._id });
  const grantNote = excludeFromTeacherEarnings
    ? 'Granted by admin (excluded from teacher earnings — e.g. WordPress migration)'
    : 'Granted by admin';
  if (!enrollment) {
    enrollment = await Enrollment.create({
      student_id: student._id,
      course_id: course._id,
      amount: finalAmount,
      status: 'approved',
      admin_note: grantNote,
      exclude_from_teacher_earnings: excludeFromTeacherEarnings,
      reviewed_by: req.userId,
      reviewed_at: new Date(),
      approved_at: new Date(),
    });
  } else {
    enrollment.amount = finalAmount;
    enrollment.status = 'approved';
    enrollment.admin_note = grantNote;
    enrollment.exclude_from_teacher_earnings = excludeFromTeacherEarnings;
    enrollment.reviewed_by = req.userId;
    enrollment.reviewed_at = new Date();
    enrollment.approved_at = new Date();
    await enrollment.save();
  }

  const order = await upsertPaidOrderForEnrollment({
    studentId: student._id,
    courseId: course._id,
    instructorId: course.teacher_id,
    amount: finalAmount,
    originalAmount,
    discountAmount,
    instructorPercentage,
    excludeFromTeacherEarnings,
    paymentMethod: excludeFromTeacherEarnings ? 'admin_migrated' : 'admin_manual',
    paymentStatusDetail: excludeFromTeacherEarnings ? 'earnings_excluded' : 'offline_confirmed',
  });

  await logAuditEvent(req, {
    action: 'admin.grant_course_access',
    target_type: 'user',
    target_id: student._id,
    details: {
      course_id: course._id,
      order_id: order._id,
      amount: finalAmount,
      exclude_from_teacher_earnings: excludeFromTeacherEarnings,
    },
  });
  res.json({
    message: excludeFromTeacherEarnings
      ? `Access granted to ${student.name} for "${course.title}" (excluded from teacher earnings)`
      : `Access granted to ${student.name} for "${course.title}"`,
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

async function getInstructorAnalytics(req, res) {
  const instructorId = req.params.id;
  const instructor = await User.findById(instructorId).select('name email role createdAt').lean();
  if (!instructor) return res.status(404).json({ message: 'Instructor not found' });
  if (instructor.role !== 'teacher') return res.status(400).json({ message: 'User is not an instructor' });

  const courses = await Course.find({ teacher_id: instructorId }).select('_id title price createdAt').lean();
  const courseIds = courses.map((c) => c._id);
  const instructorPercentage = await getInstructorPercentage();

  const [paidOrders, enrollments, reviews] = await Promise.all([
    Order.find(earningsEligiblePaidOrderQuery({ course_id: { $in: courseIds } }))
      .populate('user_id', 'name email')
      .populate('course_id', 'title')
      .lean(),
    Enrollment.countDocuments({ course_id: { $in: courseIds }, status: 'approved' }),
    Review.countDocuments({ course_id: { $in: courseIds } }),
  ]);

  let totalRevenue = 0;
  let instructorEarnings = 0;
  const byCourse = {};

  for (const order of paidOrders) {
    const amount = Number(order.amount || 0);
    totalRevenue += amount;
    const earning =
      Number(order.instructor_earning || 0) > 0
        ? Number(order.instructor_earning || 0)
        : calculateEarnings(amount, instructorPercentage).instructor_earning;
    instructorEarnings += earning;

    const cid = String(order.course_id?._id || order.course_id || '');
    if (!byCourse[cid]) {
      byCourse[cid] = {
        course_id: cid,
        course_title: order.course_id?.title || 'Course',
        sales: 0,
        revenue: 0,
        instructor_earnings: 0,
      };
    }
    byCourse[cid].sales += 1;
    byCourse[cid].revenue += amount;
    byCourse[cid].instructor_earnings += earning;
  }

  res.json({
    instructor,
    stats: {
      courses_published: courses.length,
      total_enrollments: enrollments,
      total_reviews: reviews,
      paid_sales: paidOrders.length,
      gross_revenue: Number(totalRevenue.toFixed(2)),
      instructor_earnings: Number(instructorEarnings.toFixed(2)),
      instructor_percentage: instructorPercentage,
    },
    course_breakdown: Object.values(byCourse).map((row) => ({
      ...row,
      revenue: Number(row.revenue.toFixed(2)),
      instructor_earnings: Number(row.instructor_earnings.toFixed(2)),
    })),
    recent_sales: paidOrders
      .slice()
      .sort((a, b) => new Date(b.paid_at || b.createdAt) - new Date(a.paid_at || a.createdAt))
      .slice(0, 10)
      .map((o) => ({
        order_id: o._id,
        course_title: o.course_id?.title || 'Course',
        student_name: o.user_id?.name || o.user_id?.email || 'Student',
        amount: Number(o.amount || 0),
        paid_at: o.paid_at || o.createdAt,
      })),
  });
}

async function listInstructorsSummary(req, res) {
  const instructorPercentage = await getInstructorPercentage();

  const [teachers, courseCounts, orderAgg, withdrawalAgg] = await Promise.all([
    User.find({ role: 'teacher' })
      .select('name email phone avatar_url teacher_fee account_status createdAt instructor_settings')
      .sort({ createdAt: -1 })
      .lean(),
    Course.aggregate([
      { $group: { _id: '$teacher_id', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { instructor_id: { $exists: true, $ne: null }, status: 'paid' } },
      { $group: { _id: '$instructor_id', gross: { $sum: '$amount' }, earning: { $sum: '$instructor_earning' } } },
    ]),
    require('../models/WithdrawalRequest').aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: '$instructor_id', total: { $sum: '$amount' } } },
    ]),
  ]);

  const courseMap = Object.fromEntries(courseCounts.map((r) => [String(r._id), r.count]));
  const orderMap = Object.fromEntries(orderAgg.map((r) => [String(r._id), { gross: r.gross, earning: r.earning }]));
  const wdMap = Object.fromEntries(withdrawalAgg.map((r) => [String(r._id), r.total]));

  const rows = teachers.map((t) => {
    const id = String(t._id);
    const orderData = orderMap[id] || { gross: 0, earning: 0 };
    const earned = orderData.earning > 0
      ? orderData.earning
      : calculateEarnings(orderData.gross, instructorPercentage).instructor_earning;
    const withdrawn = wdMap[id] || 0;
    return {
      ...t,
      total_courses: courseMap[id] || 0,
      commission_rate: t.teacher_fee > 0 ? t.teacher_fee : instructorPercentage,
      earnings: Number(earned.toFixed(2)),
      withdrawal: Number(withdrawn.toFixed(2)),
      balance: Number((earned - withdrawn).toFixed(2)),
    };
  });

  res.json({ instructors: rows, platform_commission: instructorPercentage });
}

async function updateAccountStatus(req, res) {
  const { status } = req.body || {};
  const allowed = ['active', 'pending', 'suspended'];
  if (!allowed.includes(status)) return res.status(400).json({ message: `status must be one of: ${allowed.join(', ')}` });
  const user = await User.findByIdAndUpdate(req.params.id, { account_status: status }, { new: true }).select('-password').lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  await logAuditEvent(req, { action: 'admin.account_status_change', target_type: 'user', target_id: req.params.id, details: { status } });
  res.json(user);
}

module.exports = {
  listUsers,
  listUsersGroupedByRole,
  listUsersByRole,
  listInstructorsSummary,
  getStudentReport,
  getInstructorAnalytics,
  createUserByAdmin,
  updateUser,
  updateUserRole,
  updateAccountStatus,
  grantCourseAccess,
  deleteUser,
};
