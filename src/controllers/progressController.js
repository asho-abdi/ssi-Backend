const Progress = require('../models/Progress');
const Course = require('../models/Course');
const Order = require('../models/Order');
const Certificate = require('../models/Certificate');
const { Enrollment } = require('../models/Enrollment');
const mongoose = require('mongoose');

/**
 * Same ordering as the student player: chapters from `course_topics` when present,
 * otherwise root `lessons`. Excludes empty topics.
 */
function flattenCourseLessons(course) {
  const topics = Array.isArray(course?.course_topics) ? course.course_topics : [];
  if (topics.length > 0) {
    const out = [];
    for (const topic of topics) {
      const raw = Array.isArray(topic?.lessons) ? topic.lessons : [];
      const sorted = [...raw].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const l of sorted) {
        if (l && l._id) out.push(l);
      }
    }
    return out;
  }
  const root = Array.isArray(course?.lessons) ? course.lessons : [];
  if (root.length === 0) return [];
  return [...root].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function lessonCount(course) {
  const flat = flattenCourseLessons(course);
  if (flat.length > 0) return flat.length;
  return course.video_url ? 1 : 0;
}

function computePercentage(course, completedIds) {
  const flat = flattenCourseLessons(course);
  const total = lessonCount(course);
  if (total === 0) return 0;
  const set = new Set((completedIds || []).map((id) => id.toString()));
  if (flat.length > 0) {
    let done = 0;
    flat.forEach((l) => {
      if (set.has(l._id.toString())) done += 1;
    });
    return Math.min(100, Math.round((done / total) * 100));
  }
  if (course.video_url && set.size > 0) {
    return 100;
  }
  return 0;
}

async function ensureAccess(userId, courseId, role, courseDoc) {
  if (role === 'admin') return true;
  if (role === 'teacher' && courseDoc) {
    const tid = courseDoc.teacher_id?._id ?? courseDoc.teacher_id;
    if (tid && String(tid) === String(userId)) return true;
  }
  const enrollment = await Enrollment.findOne({ student_id: userId, course_id: courseId, status: 'approved' }).lean();
  if (enrollment) return true;
  const paid = await Order.findOne({ user_id: userId, course_id: courseId, status: 'paid' });
  return !!paid;
}

function normalizeCourseId(raw) {
  return String(raw ?? '').trim();
}

function snapshotCourseTitle(course) {
  const t = course?.title;
  return t != null && String(t).trim() ? String(t).trim() : '';
}

/** `course` optional — when present, avoids an extra DB read for the title */
async function maybeIssueCertificate(userId, courseId, course) {
  const p = await Progress.findOne({ user_id: userId, course_id: courseId });
  if (!p || p.progress_percentage < 100) return;
  const snap = snapshotCourseTitle(course);
  let fromDb = '';
  if (!snap) {
    const lean = await Course.findById(courseId).select('title').lean();
    if (lean?.title != null) fromDb = String(lean.title).trim();
  }
  const courseTitle = snap || fromDb || '';

  const exists = await Certificate.findOne({ user_id: userId, course_id: courseId });
  if (!exists) {
    await Certificate.create({
      user_id: userId,
      course_id: courseId,
      issue_date: new Date(),
      course_title: courseTitle,
    });
    return;
  }
  if (courseTitle && !(exists.course_title && String(exists.course_title).trim())) {
    exists.course_title = courseTitle;
    await exists.save();
  }
}

async function getProgress(req, res) {
  const courseId = normalizeCourseId(req.params.courseId);
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: 'Invalid course id' });
  }
  const course = await Course.findById(courseId);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!(await ensureAccess(req.userId, courseId, req.userRole, course))) {
    return res.status(403).json({ message: 'Purchase required' });
  }
  let progress = await Progress.findOne({ user_id: req.userId, course_id: courseId });
  if (!progress) {
    progress = await Progress.create({
      user_id: req.userId,
      course_id: courseId,
      progress_percentage: 0,
      completed_lesson_ids: [],
      in_video_quiz_attempts: [],
    });
  }
  res.json(progress);
}

async function updateProgress(req, res) {
  const courseId = normalizeCourseId(req.params.courseId);
  const { lesson_id, complete } = req.body;
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: 'Invalid course id' });
  }
  const course = await Course.findById(courseId);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!(await ensureAccess(req.userId, courseId, req.userRole, course))) {
    return res.status(403).json({ message: 'Purchase required' });
  }

  let progress = await Progress.findOne({ user_id: req.userId, course_id: courseId });
  if (!progress) {
    progress = new Progress({
      user_id: req.userId,
      course_id: courseId,
      completed_lesson_ids: [],
      in_video_quiz_attempts: [],
    });
  }

  const allLessons = flattenCourseLessons(course);
  const idSet = new Set((progress.completed_lesson_ids || []).map((id) => id.toString()));

  if (allLessons.length > 0) {
    if (!lesson_id) {
      return res.status(400).json({ message: 'lesson_id is required' });
    }
    const lid = String(lesson_id).trim();
    const valid = allLessons.some((l) => l._id.toString() === lid);
    if (!valid) return res.status(400).json({ message: 'Invalid lesson' });
    if (complete === false) {
      idSet.delete(lid);
    } else {
      idSet.add(lid);
    }
    progress.completed_lesson_ids = allLessons.filter((l) => idSet.has(l._id.toString())).map((l) => l._id);
  } else if (course.video_url) {
    progress.completed_lesson_ids = [];
    progress.progress_percentage = complete === false ? 0 : 100;
    await progress.save();
    await maybeIssueCertificate(req.userId, courseId, course);
    return res.json(progress);
  }

  progress.progress_percentage = computePercentage(course, progress.completed_lesson_ids);
  await progress.save();
  await maybeIssueCertificate(req.userId, courseId, course);
  res.json(progress);
}

function findInVideoQuiz(course, quizId) {
  if (!quizId) return null;
  const target = String(quizId);
  const topics = Array.isArray(course?.course_topics) ? course.course_topics : [];
  for (const topic of topics) {
    const quizzes = Array.isArray(topic?.in_video_quizzes) ? topic.in_video_quizzes : [];
    for (const quiz of quizzes) {
      if (String(quiz?._id) === target) {
        return { topic, quiz };
      }
    }
  }
  return null;
}

function resolveRetryConfig(quiz) {
  const retryPolicyRaw = String(quiz?.retry_policy || '').trim().toLowerCase();
  const retryPolicy = ['no_retry', 'retry_on_skip', 'retry_on_incorrect', 'retry_always'].includes(retryPolicyRaw)
    ? retryPolicyRaw
    : Boolean(quiz?.repeat_on_skip)
      ? 'retry_on_skip'
      : 'no_retry';
  const rawMaxAttempts = Number(quiz?.max_attempts);
  const maxAttempts = Number.isFinite(rawMaxAttempts)
    ? Math.max(1, Math.min(10, Math.floor(rawMaxAttempts)))
    : retryPolicy === 'no_retry'
      ? 1
      : 2;
  const rawCooldown = Number(quiz?.retry_cooldown_seconds);
  const retryCooldownSeconds = Number.isFinite(rawCooldown) ? Math.max(0, Math.min(86400, Math.floor(rawCooldown))) : 0;
  return { retryPolicy, maxAttempts, retryCooldownSeconds };
}

function canRetryByPolicy(retryPolicy, status) {
  if (retryPolicy === 'retry_always') return true;
  if (retryPolicy === 'retry_on_skip') return status === 'skipped';
  if (retryPolicy === 'retry_on_incorrect') return status === 'incorrect';
  return false;
}

async function submitInVideoQuizAttempt(req, res) {
  const courseId = normalizeCourseId(req.params.courseId);
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: 'Invalid course id' });
  }
  const course = await Course.findById(courseId);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!(await ensureAccess(req.userId, courseId, req.userRole, course))) {
    return res.status(403).json({ message: 'Purchase required' });
  }

  const quizId = String(req.body?.quiz_id || '').trim();
  if (!quizId) return res.status(400).json({ message: 'quiz_id is required' });
  const located = findInVideoQuiz(course, quizId);
  if (!located) return res.status(400).json({ message: 'Quiz not found in this course' });

  const status = String(req.body?.status || '').toLowerCase();
  if (!['correct', 'incorrect', 'skipped'].includes(status)) {
    return res.status(400).json({ message: 'status must be correct, incorrect, or skipped' });
  }

  let progress = await Progress.findOne({ user_id: req.userId, course_id: courseId });
  if (!progress) {
    progress = await Progress.create({
      user_id: req.userId,
      course_id: courseId,
      progress_percentage: 0,
      completed_lesson_ids: [],
      in_video_quiz_attempts: [],
    });
  }

  const priorAttempts = (progress.in_video_quiz_attempts || []).filter(
    (attempt) => String(attempt?.quiz_id) === String(located.quiz._id)
  );
  const { retryPolicy, maxAttempts, retryCooldownSeconds } = resolveRetryConfig(located.quiz);
  if (priorAttempts.length >= maxAttempts) {
    return res.status(400).json({ message: 'Maximum attempts reached for this popup quiz' });
  }
  const latestAttempt = priorAttempts[priorAttempts.length - 1];
  if (latestAttempt) {
    if (!canRetryByPolicy(retryPolicy, String(latestAttempt.status || ''))) {
      return res.status(400).json({ message: 'Retry policy does not allow another attempt' });
    }
    const nextRetryAt = latestAttempt.next_retry_at ? new Date(latestAttempt.next_retry_at) : null;
    if (nextRetryAt && nextRetryAt > new Date()) {
      return res.status(400).json({ message: 'Retry cooldown is active for this popup quiz' });
    }
  }

  const nextAttemptNumber = priorAttempts.length + 1;
  const retriesRemaining = maxAttempts - nextAttemptNumber;
  const canRetryCurrentOutcome = retriesRemaining > 0 && canRetryByPolicy(retryPolicy, status);
  const nextRetryAt = canRetryCurrentOutcome && retryCooldownSeconds > 0 ? new Date(Date.now() + retryCooldownSeconds * 1000) : null;
  const nextAttempt = {
    quiz_id: located.quiz._id,
    topic_id: located.topic?._id || null,
    lesson_id: located.quiz?.lesson_id || null,
    selected_option_index:
      req.body?.selected_option_index != null && Number.isFinite(Number(req.body.selected_option_index))
        ? Number(req.body.selected_option_index)
        : null,
    is_correct: req.body?.is_correct != null ? Boolean(req.body.is_correct) : status === 'correct' ? true : status === 'incorrect' ? false : null,
    status,
    attempted_at: new Date(),
    can_repeat: canRetryCurrentOutcome,
    attempt_number: nextAttemptNumber,
    retry_policy_snapshot: retryPolicy,
    max_attempts_snapshot: maxAttempts,
    retry_cooldown_seconds_snapshot: retryCooldownSeconds,
    next_retry_at: nextRetryAt,
  };

  progress.in_video_quiz_attempts.push(nextAttempt);
  await progress.save();
  res.json(progress);
}

module.exports = { getProgress, updateProgress, submitInVideoQuizAttempt };
