const User = require('../models/User');
const Course = require('../models/Course');
const Order = require('../models/Order');
const Progress = require('../models/Progress');
const { calculateEarnings, getInstructorPercentage } = require('../utils/commission');

async function adminOverview(req, res) {
  const instructorPercentage = await getInstructorPercentage();
  const [users, courses, orders, paidOrders] = await Promise.all([
    User.countDocuments(),
    Course.countDocuments(),
    Order.countDocuments(),
    Order.countDocuments({ status: 'paid' }),
  ]);
  const paidRows = await Order.find({ status: 'paid' })
    .select('amount instructor_earning admin_earning')
    .lean();
  let revenue = 0;
  let platform_earnings = 0;
  let instructor_payouts = 0;
  for (const row of paidRows) {
    const amount = Number(row.amount || 0);
    revenue += amount;
    const split =
      Number(row.instructor_earning || 0) > 0 || Number(row.admin_earning || 0) > 0
        ? {
            instructor_earning: Number(row.instructor_earning || 0),
            admin_earning: Number(row.admin_earning || 0),
          }
        : calculateEarnings(amount, instructorPercentage);
    instructor_payouts += split.instructor_earning;
    platform_earnings += split.admin_earning;
  }
  res.json({
    users,
    courses,
    orders,
    paid_orders: paidOrders,
    revenue,
    platform_earnings,
    instructor_payouts,
  });
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function parseDateInput(input) {
  const value = String(input || '').trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parsePoints(period, input) {
  const raw = Number(input);
  if (!Number.isFinite(raw) || raw <= 0) {
    if (period === 'daily') return 14;
    if (period === 'weekly') return 12;
    return 12;
  }
  const points = Math.trunc(raw);
  if (period === 'daily') return Math.min(Math.max(points, 3), 60);
  if (period === 'weekly') return Math.min(Math.max(points, 2), 52);
  return Math.min(Math.max(points, 2), 24);
}

function buildRange(period, pointsCount) {
  const now = new Date();

  if (period === 'weekly') {
    const start = startOfWeek(now);
    const points = [];
    for (let i = pointsCount - 1; i >= 0; i -= 1) {
      const from = addDays(start, -i * 7);
      const to = addDays(from, 7);
      points.push({
        key: from.toISOString(),
        label: `${from.getDate()}/${from.getMonth() + 1}`,
        from,
        to,
      });
    }
    return points;
  }

  if (period === 'monthly') {
    const start = startOfMonth(now);
    const points = [];
    for (let i = pointsCount - 1; i >= 0; i -= 1) {
      const from = addMonths(start, -i);
      const to = addMonths(from, 1);
      points.push({
        key: from.toISOString(),
        label: from.toLocaleString('en-US', { month: 'short' }),
        from,
        to,
      });
    }
    return points;
  }

  const start = startOfDay(now);
  const points = [];
  for (let i = pointsCount - 1; i >= 0; i -= 1) {
    const from = addDays(start, -i);
    const to = addDays(from, 1);
    points.push({
      key: from.toISOString(),
      label: `${from.getDate()}/${from.getMonth() + 1}`,
      from,
      to,
    });
  }
  return points;
}

function buildCustomRange(period, startDateRaw, endDateRaw) {
  const startDate = startOfDay(startDateRaw);
  const endDate = startOfDay(endDateRaw);
  if (startDate > endDate) return [];

  const points = [];
  if (period === 'monthly') {
    let from = startOfMonth(startDate);
    while (from <= endDate) {
      const to = addMonths(from, 1);
      points.push({
        key: from.toISOString(),
        label: from.toLocaleString('en-US', { month: 'short' }),
        from,
        to,
      });
      from = to;
    }
    return points;
  }

  if (period === 'weekly') {
    let from = startOfWeek(startDate);
    while (from <= endDate) {
      const to = addDays(from, 7);
      points.push({
        key: from.toISOString(),
        label: `${from.getDate()}/${from.getMonth() + 1}`,
        from,
        to,
      });
      from = to;
    }
    return points;
  }

  let from = startOfDay(startDate);
  while (from <= endDate) {
    const to = addDays(from, 1);
    points.push({
      key: from.toISOString(),
      label: `${from.getDate()}/${from.getMonth() + 1}`,
      from,
      to,
    });
    from = to;
  }
  return points;
}

async function adminReport(req, res) {
  const periodInput = String(req.query.period || 'daily').toLowerCase();
  const period = ['daily', 'weekly', 'monthly'].includes(periodInput) ? periodInput : 'daily';
  const startDateInput = parseDateInput(req.query.start_date);
  const endDateInput = parseDateInput(req.query.end_date);
  const hasCustomRange = Boolean(startDateInput && endDateInput);

  const pointsCount = parsePoints(period, req.query.points);
  const rangePoints = hasCustomRange
    ? buildCustomRange(period, startDateInput, endDateInput)
    : buildRange(period, pointsCount);
  if (!rangePoints.length) {
    return res.status(400).json({ message: 'Invalid date range' });
  }
  const fromDate = rangePoints[0].from;
  const toDate = rangePoints[rangePoints.length - 1].to;

  const paidOrders = await Order.find({
    status: 'paid',
    $or: [
      { paid_at: { $gte: fromDate, $lt: toDate } },
      { paid_at: null, createdAt: { $gte: fromDate, $lt: toDate } },
    ],
  })
    .select('amount paid_at createdAt')
    .lean();

  const allOrders = await Order.find({
    createdAt: { $gte: fromDate, $lt: toDate },
  })
    .select('status')
    .lean();

  const buckets = rangePoints.map((point) => ({
    label: point.label,
    enrollments: 0,
    payments: 0,
  }));

  for (const order of paidOrders) {
    const orderDate = order.paid_at ? new Date(order.paid_at) : new Date(order.createdAt);
    const idx = rangePoints.findIndex((point) => orderDate >= point.from && orderDate < point.to);
    if (idx === -1) continue;
    buckets[idx].enrollments += 1;
    buckets[idx].payments += Number(order.amount || 0);
  }

  const totals = buckets.reduce(
    (acc, row) => ({
      enrollments: acc.enrollments + row.enrollments,
      payments: acc.payments + row.payments,
    }),
    { enrollments: 0, payments: 0 }
  );

  const statusBreakdownMap = {
    paid: 0,
    pending: 0,
    unpaid: 0,
    failed: 0,
  };
  for (const order of allOrders) {
    const key = String(order.status || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(statusBreakdownMap, key)) {
      statusBreakdownMap[key] += 1;
    }
  }
  const status_breakdown = Object.entries(statusBreakdownMap)
    .map(([status, count]) => ({ status, count }))
    .filter((item) => item.count > 0);

  res.json({
    period,
    range: {
      custom: hasCustomRange,
      start_date: fromDate.toISOString(),
      end_date: addDays(toDate, -1).toISOString(),
    },
    totals,
    points: buckets.map((row) => ({
      ...row,
      payments: Number(row.payments.toFixed(2)),
    })),
    status_breakdown,
  });
}

function flattenInVideoQuizzes(course) {
  const rows = [];
  (course?.course_topics || []).forEach((topic) => {
    (topic?.in_video_quizzes || []).forEach((quiz) => {
      rows.push({
        quiz_id: String(quiz?._id),
        question: String(quiz?.question || ''),
        lesson_id: quiz?.lesson_id ? String(quiz.lesson_id) : '',
        lesson_order: Number.isFinite(Number(quiz?.lesson_order)) ? Number(quiz.lesson_order) : null,
        timestamp_seconds: Number(quiz?.timestamp_seconds || 0),
        retry_policy: String(quiz?.retry_policy || ''),
        max_attempts: Number(quiz?.max_attempts || 0),
      });
    });
  });
  return rows;
}

async function adminInVideoQuizAnalytics(req, res) {
  const courseId = String(req.query.course_id || '').trim();
  const courseFilter = courseId ? { _id: courseId } : {};
  const courses = await Course.find(courseFilter).select('title lessons course_topics').lean();
  if (courseId && courses.length === 0) {
    return res.status(404).json({ message: 'Course not found' });
  }

  const quizIndex = {};
  const quizIds = [];
  courses.forEach((course) => {
    const lessonMap = {};
    (course.lessons || []).forEach((lesson) => {
      lessonMap[String(lesson._id)] = String(lesson.title || 'Lesson');
    });
    flattenInVideoQuizzes(course).forEach((quiz) => {
      quizIndex[quiz.quiz_id] = {
        ...quiz,
        course_id: String(course._id),
        course_title: String(course.title || 'Course'),
        lesson_title: quiz.lesson_id ? lessonMap[quiz.lesson_id] || 'Lesson' : `Lesson #${Number(quiz.lesson_order ?? 0) + 1}`,
      };
      quizIds.push(quiz.quiz_id);
    });
  });

  if (quizIds.length === 0) {
    return res.json({ totals: { attempts: 0, correct: 0, incorrect: 0, skipped: 0 }, quizzes: [], lessons: [] });
  }

  const progressRows = await Progress.find({
    course_id: { $in: courses.map((course) => course._id) },
    'in_video_quiz_attempts.quiz_id': { $in: quizIds },
  })
    .select('in_video_quiz_attempts')
    .lean();

  const byQuiz = {};
  const byLesson = {};
  let totalAttempts = 0;
  let totalCorrect = 0;
  let totalIncorrect = 0;
  let totalSkipped = 0;

  progressRows.forEach((row) => {
    (row.in_video_quiz_attempts || []).forEach((attempt) => {
      const quizId = String(attempt?.quiz_id || '');
      const quizMeta = quizIndex[quizId];
      if (!quizMeta) return;
      const status = String(attempt?.status || '').toLowerCase();
      if (!['correct', 'incorrect', 'skipped'].includes(status)) return;
      if (!byQuiz[quizId]) {
        byQuiz[quizId] = {
          quiz_id: quizId,
          course_id: quizMeta.course_id,
          course_title: quizMeta.course_title,
          lesson_id: quizMeta.lesson_id || '',
          lesson_title: quizMeta.lesson_title,
          question: quizMeta.question,
          timestamp_seconds: quizMeta.timestamp_seconds,
          retry_policy: quizMeta.retry_policy,
          max_attempts: quizMeta.max_attempts,
          attempts: 0,
          correct: 0,
          incorrect: 0,
          skipped: 0,
        };
      }
      if (!byLesson[`${quizMeta.course_id}:${quizMeta.lesson_title}`]) {
        byLesson[`${quizMeta.course_id}:${quizMeta.lesson_title}`] = {
          course_id: quizMeta.course_id,
          course_title: quizMeta.course_title,
          lesson_title: quizMeta.lesson_title,
          attempts: 0,
          correct: 0,
          incorrect: 0,
          skipped: 0,
        };
      }

      totalAttempts += 1;
      byQuiz[quizId].attempts += 1;
      byLesson[`${quizMeta.course_id}:${quizMeta.lesson_title}`].attempts += 1;
      if (status === 'correct') {
        totalCorrect += 1;
        byQuiz[quizId].correct += 1;
        byLesson[`${quizMeta.course_id}:${quizMeta.lesson_title}`].correct += 1;
      } else if (status === 'incorrect') {
        totalIncorrect += 1;
        byQuiz[quizId].incorrect += 1;
        byLesson[`${quizMeta.course_id}:${quizMeta.lesson_title}`].incorrect += 1;
      } else {
        totalSkipped += 1;
        byQuiz[quizId].skipped += 1;
        byLesson[`${quizMeta.course_id}:${quizMeta.lesson_title}`].skipped += 1;
      }
    });
  });

  const toRow = (row) => {
    const attempts = Number(row.attempts || 0);
    const pct = (value) => (attempts > 0 ? Number(((Number(value || 0) / attempts) * 100).toFixed(2)) : 0);
    return {
      ...row,
      correct_pct: pct(row.correct),
      incorrect_pct: pct(row.incorrect),
      skipped_pct: pct(row.skipped),
    };
  };

  const quizzes = Object.values(byQuiz)
    .map(toRow)
    .sort((a, b) => b.attempts - a.attempts);
  const lessons = Object.values(byLesson)
    .map(toRow)
    .sort((a, b) => b.attempts - a.attempts);

  res.json({
    totals: {
      attempts: totalAttempts,
      correct: totalCorrect,
      incorrect: totalIncorrect,
      skipped: totalSkipped,
      correct_pct: totalAttempts > 0 ? Number(((totalCorrect / totalAttempts) * 100).toFixed(2)) : 0,
      incorrect_pct: totalAttempts > 0 ? Number(((totalIncorrect / totalAttempts) * 100).toFixed(2)) : 0,
      skipped_pct: totalAttempts > 0 ? Number(((totalSkipped / totalAttempts) * 100).toFixed(2)) : 0,
    },
    quizzes,
    lessons,
  });
}

module.exports = { adminOverview, adminReport, adminInVideoQuizAnalytics };
