const Course = require('../models/Course');
const User = require('../models/User');
const Category = require('../models/Category');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { Enrollment } = require('../models/Enrollment');

function normalizeSalePrice(price, salePriceInput) {
  if (salePriceInput == null || salePriceInput === '') return 0;
  const parsed = Number(salePriceInput);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, Number(price));
}

function normalizeDifficultyLevel(levelInput) {
  const value = String(levelInput || '').trim().toLowerCase();
  return ['all', 'beginner', 'intermediate', 'expert'].includes(value) ? value : 'all';
}

function normalizePricingType(pricingTypeInput, priceInput) {
  const value = String(pricingTypeInput || '').trim().toLowerCase();
  if (value === 'free' || value === 'paid') return value;
  return Number(priceInput || 0) > 0 ? 'paid' : 'free';
}

function normalizeLessons(body) {
  const { lessons, video_url } = body;
  if (Array.isArray(lessons) && lessons.length > 0) {
    return lessons.map((l, i) => ({
      title: l.title,
      video_url: l.video_url,
      order: typeof l.order === 'number' ? l.order : i,
    }));
  }
  if (video_url) {
    return [{ title: 'Introduction', video_url, order: 0 }];
  }
  return [];
}

function normalizeAssignments(body) {
  if (!Array.isArray(body.assignments)) return [];
  return body.assignments
    .map((a) => ({
      title: a?.title,
      description: a?.description ?? '',
      due_date: a?.due_date || undefined,
      points: a?.points != null ? Number(a.points) : 100,
    }))
    .filter((a) => a.title);
}

function parseOptions(rawOptions) {
  if (Array.isArray(rawOptions)) return rawOptions.map((o) => String(o).trim()).filter(Boolean);
  if (typeof rawOptions === 'string') {
    return rawOptions
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeQuestionType(rawType) {
  const type = String(rawType || '').trim().toLowerCase();
  if (['circle_right_answer', 'true_false', 'fill_blank', 'short_answer'].includes(type)) return type;
  return 'circle_right_answer';
}

function normalizeQuizQuestion(rawQuestion) {
  const question = String(rawQuestion?.question || '').trim();
  if (!question) return null;

  const question_type = normalizeQuestionType(rawQuestion?.question_type);
  const answerText = String(rawQuestion?.answer_text || '').trim();
  const parsedAnswerIndex = Number.isFinite(Number(rawQuestion?.answer_index)) ? Number(rawQuestion.answer_index) : 0;

  if (question_type === 'true_false') {
    const safeAnswerIndex = parsedAnswerIndex === 1 ? 1 : 0;
    return {
      question,
      question_type,
      options: ['True', 'False'],
      answer_index: safeAnswerIndex,
      answer_text: '',
    };
  }

  if (question_type === 'fill_blank' || question_type === 'short_answer') {
    if (!answerText) return null;
    return {
      question,
      question_type,
      options: [],
      answer_index: 0,
      answer_text: answerText,
    };
  }

  const options = parseOptions(rawQuestion?.options);
  if (options.length < 2) return null;
  const safeAnswerIndex = parsedAnswerIndex < 0 ? 0 : parsedAnswerIndex > options.length - 1 ? options.length - 1 : parsedAnswerIndex;
  return {
    question,
    question_type: 'circle_right_answer',
    options,
    answer_index: safeAnswerIndex,
    answer_text: '',
  };
}

function normalizeQuizzes(body) {
  if (!Array.isArray(body.quizzes)) return [];
  return body.quizzes
    .map((q) => {
      const questions = Array.isArray(q?.questions)
        ? q.questions
            .map(normalizeQuizQuestion)
            .filter(Boolean)
        : [];
      return {
        title: q?.title,
        description: q?.description ?? '',
        time_limit_minutes: q?.time_limit_minutes != null ? Number(q.time_limit_minutes) : undefined,
        questions,
      };
    })
    .filter((q) => q.title);
}

function normalizeFileType(rawType) {
  const type = String(rawType || '').trim().toLowerCase();
  if (type === 'pdf') return 'pdf';
  if (type === 'ppt') return 'ppt';
  if (type === 'excel') return 'excel';
  if (type === 'zip') return 'zip';
  return 'other';
}

function normalizeResources(rawResources) {
  if (!Array.isArray(rawResources)) return [];
  return rawResources
    .map((resource) => {
      const sizeParsed = Number(resource?.size_bytes);
      const size_bytes = Number.isFinite(sizeParsed) && sizeParsed >= 0 ? Math.floor(sizeParsed) : 0;
      return {
        name: String(resource?.name || '').trim(),
        url: String(resource?.url || '').trim(),
        file_type: normalizeFileType(resource?.file_type),
        size_bytes,
        storage_path: String(resource?.storage_path || '').trim(),
      };
    })
    .filter((resource) => resource.name && resource.url);
}

function normalizeTopicResources(rawTopicResources) {
  if (!Array.isArray(rawTopicResources)) return [];
  return rawTopicResources
    .map((topicResource, idx) => ({
      topic_index: Number.isFinite(Number(topicResource?.topic_index)) ? Number(topicResource.topic_index) : idx,
      topic_title: String(topicResource?.topic_title || '').trim(),
      resources: normalizeResources(topicResource?.resources || []),
    }))
    .filter((topicResource) => topicResource.resources.length > 0);
}

function normalizeTopicLessons(rawLessons) {
  if (!Array.isArray(rawLessons)) return [];
  return rawLessons
    .map((lesson, idx) => ({
      title: String(lesson?.title || '').trim(),
      video_url: String(lesson?.video_url || '').trim(),
      order: Number.isFinite(Number(lesson?.order)) ? Number(lesson.order) : idx,
    }))
    .filter((lesson) => lesson.title && lesson.video_url);
}

function parseTimestampSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Math.floor(Number(raw)));
  const parts = raw.split(':').map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    return Math.floor(nums[0] * 60 + nums[1]);
  }
  return Math.floor(nums[0] * 3600 + nums[1] * 60 + nums[2]);
}

function normalizeInVideoQuizzes(rawQuizzes, topicContext = {}) {
  if (!Array.isArray(rawQuizzes)) return [];
  const lessonIdSet = new Set((topicContext.lessons || []).map((lesson) => String(lesson?._id || '')));
  const lessonOrderSet = new Set((topicContext.lessons || []).map((lesson) => Number(lesson?.order)).filter((n) => Number.isFinite(n)));
  return rawQuizzes
    .map((quiz) => {
      const question = String(quiz?.question || '').trim();
      if (!question) return null;
      const options = parseOptions(quiz?.options || quiz?.options_text);
      if (options.length < 2) return null;
      const parsedCorrect = Number(quiz?.correct_answer_index);
      const safeCorrect = Number.isFinite(parsedCorrect) ? Math.max(0, Math.min(options.length - 1, Math.floor(parsedCorrect))) : 0;
      const timestampSeconds = parseTimestampSeconds(quiz?.timestamp_seconds ?? quiz?.timestamp);
      if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) return null;
      const lessonId = quiz?.lesson_id ? String(quiz.lesson_id) : '';
      const normalizedLessonId = lessonId && lessonIdSet.has(lessonId) ? lessonId : null;
      const parsedLessonOrder = Number(quiz?.lesson_order);
      const normalizedLessonOrder =
        Number.isFinite(parsedLessonOrder) && parsedLessonOrder >= 0 && lessonOrderSet.has(parsedLessonOrder)
          ? parsedLessonOrder
          : null;
      const retryPolicyRaw = String(quiz?.retry_policy || '').trim().toLowerCase();
      const retryPolicy = ['no_retry', 'retry_on_skip', 'retry_on_incorrect', 'retry_always'].includes(retryPolicyRaw)
        ? retryPolicyRaw
        : Boolean(quiz?.repeat_on_skip)
          ? 'retry_on_skip'
          : 'no_retry';
      const parsedMaxAttempts = Number(quiz?.max_attempts);
      const maxAttempts = Number.isFinite(parsedMaxAttempts)
        ? Math.max(1, Math.min(10, Math.floor(parsedMaxAttempts)))
        : retryPolicy === 'no_retry'
          ? 1
          : 2;
      const parsedCooldown = Number(quiz?.retry_cooldown_seconds);
      const retryCooldownSeconds = Number.isFinite(parsedCooldown)
        ? Math.max(0, Math.min(86400, Math.floor(parsedCooldown)))
        : 0;
      return {
        question,
        options,
        correct_answer_index: safeCorrect,
        explanation: String(quiz?.explanation || '').trim(),
        timestamp_seconds: timestampSeconds,
        lesson_id: normalizedLessonId,
        lesson_order: normalizedLessonOrder,
        repeat_on_skip: Boolean(quiz?.repeat_on_skip),
        retry_policy: retryPolicy,
        max_attempts: maxAttempts,
        retry_cooldown_seconds: retryCooldownSeconds,
        topic_id: topicContext.topicId || null,
        course_id: topicContext.courseId || null,
      };
    })
    .filter(Boolean);
}

function normalizeCourseTopics(rawTopics, context = {}) {
  if (!Array.isArray(rawTopics)) return [];
  return rawTopics
    .map((topic, idx) => {
      const lessons = normalizeTopicLessons(topic?.lessons);
      const assignments = normalizeAssignments({ assignments: topic?.assignments || [] });
      const quizzes = normalizeQuizzes({ quizzes: topic?.quizzes || [] });
      const in_video_quizzes = normalizeInVideoQuizzes(topic?.in_video_quizzes || [], {
        lessons,
        topicId: topic?._id || null,
        courseId: context.courseId || null,
      });
      const resources = normalizeResources(topic?.resources || []);
      return {
        title: String(topic?.title || '').trim() || `Chapter ${idx + 1}`,
        lessons,
        assignments,
        quizzes,
        in_video_quizzes,
        resources,
      };
    })
    .filter(
      (topic) =>
        topic.lessons.length ||
        topic.assignments.length ||
        topic.quizzes.length ||
        topic.in_video_quizzes.length ||
        topic.resources.length ||
        topic.title
    );
}

const RESOURCE_UPLOAD_PREFIX = '/uploads/resources/';

function resourceStoragePath(resource) {
  const direct = String(resource?.storage_path || '').trim();
  if (direct.startsWith(RESOURCE_UPLOAD_PREFIX)) return direct.split('?')[0];
  const url = String(resource?.url || '').trim();
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.pathname.startsWith(RESOURCE_UPLOAD_PREFIX)) return u.pathname.split('?')[0];
  } catch {
    if (url.startsWith(RESOURCE_UPLOAD_PREFIX)) return url.split('?')[0];
  }
  return '';
}

function findResourceInCourse(coursePlain, resourceId) {
  const rid = String(resourceId || '');
  if (!rid || !mongoose.Types.ObjectId.isValid(rid)) return null;
  const idStr = (x) => String(x?._id || '');
  for (const r of coursePlain.all_resources || []) {
    if (idStr(r) === rid) return r;
  }
  for (const topic of coursePlain.course_topics || []) {
    for (const r of topic.resources || []) {
      if (idStr(r) === rid) return r;
    }
  }
  for (const row of coursePlain.topic_resources || []) {
    for (const r of row.resources || []) {
      if (idStr(r) === rid) return r;
    }
  }
  return null;
}

function courseIsPaid(course) {
  return String(course.pricing_type || '').toLowerCase() === 'paid' || Number(course.price || 0) > 0;
}

async function assertDownloadAllowed(userId, userRole, course) {
  if (['admin', 'editor'].includes(userRole)) return true;
  const teacherId = course.teacher_id?._id || course.teacher_id;
  if (userRole === 'teacher' && teacherId && String(teacherId) === String(userId)) return true;
  if (!courseIsPaid(course)) return true;
  const row = await Enrollment.findOne({
    student_id: userId,
    course_id: course._id,
    status: 'approved',
  }).lean();
  return Boolean(row);
}

async function downloadCourseResource(req, res) {
  const { courseId, resourceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(courseId) || !mongoose.Types.ObjectId.isValid(resourceId)) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  const course = await Course.findById(courseId).select(
    'title pricing_type price teacher_id all_resources course_topics topic_resources'
  );
  if (!course) return res.status(404).json({ message: 'Course not found' });

  const plain = course.toObject({ flattenMaps: true });
  const resource = findResourceInCourse(plain, resourceId);
  if (!resource) return res.status(404).json({ message: 'Resource not found' });

  const storagePath = resourceStoragePath(resource);
  if (!storagePath || !storagePath.startsWith(RESOURCE_UPLOAD_PREFIX)) {
    return res.status(400).json({ message: 'Resource file is not downloadable from this server' });
  }

  const relativeName = storagePath.slice(RESOURCE_UPLOAD_PREFIX.length);
  if (!relativeName || relativeName.includes('..') || relativeName.includes('/') || relativeName.includes('\\')) {
    return res.status(400).json({ message: 'Invalid file path' });
  }

  const resourcesDir = path.resolve(__dirname, '..', '..', 'uploads', 'resources');
  const absPath = path.resolve(resourcesDir, relativeName);
  if (!absPath.startsWith(resourcesDir)) return res.status(400).json({ message: 'Invalid file path' });

  const allowed = await assertDownloadAllowed(req.userId, req.userRole, course);
  if (!allowed) return res.status(403).json({ message: 'Enroll in this course to download resources' });

  if (!fs.existsSync(absPath)) return res.status(404).json({ message: 'File missing on server' });

  const basename = path.basename(absPath);
  const isZip = String(resource.file_type || '').toLowerCase() === 'zip' || basename.toLowerCase().endsWith('.zip');
  res.setHeader('Content-Type', isZip ? 'application/zip' : 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${basename.replace(/"/g, '')}"`);

  const stream = fs.createReadStream(absPath);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ message: 'Could not read file' });
  });
  stream.pipe(res);
}

async function listCourses(req, res) {
  const courses = await Course.find()
    .populate('teacher_id', 'name email')
    .populate('category_id', 'name slug')
    .sort({ createdAt: -1 })
    .lean();
  res.json(courses);
}

async function getCourse(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid course id' });
  }
  const course = await Course.findById(req.params.id)
    .populate('teacher_id', 'name email')
    .populate('category_id', 'name slug')
    .lean();
  if (!course) return res.status(404).json({ message: 'Course not found' });
  res.json(course);
}

async function createCourse(req, res) {
  let teacherId;
  if (req.userRole === 'admin') {
    teacherId = req.body.teacher_id;
    if (!teacherId) {
      return res.status(400).json({ message: 'teacher_id is required' });
    }
  } else {
    teacherId = req.userId;
  }
  const teacher = await User.findById(teacherId);
  if (!teacher) return res.status(400).json({ message: 'Invalid teacher' });
  if (!['teacher', 'admin'].includes(teacher.role)) {
    return res.status(400).json({ message: 'teacher_id must reference a teacher or admin' });
  }
  const lessons = normalizeLessons(req.body);
  const assignments = normalizeAssignments(req.body);
  const quizzes = normalizeQuizzes(req.body);
  const all_resources = normalizeResources(req.body.all_resources);
  const topic_resources = normalizeTopicResources(req.body.topic_resources);
  const course_topics = normalizeCourseTopics(req.body.course_topics);
  let categoryId = null;
  if (req.body.category_id) {
    const category = await Category.findById(req.body.category_id);
    if (!category) return res.status(400).json({ message: 'Invalid category' });
    categoryId = category._id;
  }
  const video_url = req.body.video_url || (lessons[0] && lessons[0].video_url) || '';
  const course = await Course.create({
    title: req.body.title,
    description: req.body.description ?? '',
    pricing_type: normalizePricingType(req.body.pricing_type, req.body.price),
    is_premium: req.body.is_premium != null ? Boolean(req.body.is_premium) : Number(req.body.price) > 0,
    price: Number(req.body.price),
    sale_price: normalizeSalePrice(req.body.price, req.body.sale_price),
    difficulty_level: normalizeDifficultyLevel(req.body.difficulty_level),
    duration: Number(req.body.duration),
    thumbnail: req.body.thumbnail ?? '',
    video_url,
    category_id: categoryId,
    teacher_id: teacherId,
    lessons,
    assignments,
    quizzes,
    course_topics,
    all_resources,
    topic_resources,
  });
  course.course_topics = (course.course_topics || []).map((topic) => ({
    ...topic.toObject(),
    in_video_quizzes: (topic.in_video_quizzes || []).map((quiz) => ({
      ...quiz.toObject(),
      course_id: course._id,
      topic_id: topic._id,
    })),
  }));
  await course.save();
  const populated = await Course.findById(course._id)
    .populate('teacher_id', 'name email')
    .populate('category_id', 'name slug');
  res.status(201).json(populated);
}

async function updateCourse(req, res) {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  const isOwner = course.teacher_id.toString() === req.userId;
  const isAdmin = req.userRole === 'admin';
  const canEditAny = req.userRole === 'editor';
  if (!isAdmin && !canEditAny && !isOwner) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const {
    title,
    description,
    pricing_type,
    is_premium,
    price,
    sale_price,
    difficulty_level,
    duration,
    thumbnail,
    video_url,
    lessons,
    assignments,
    quizzes,
    course_topics,
    all_resources,
    topic_resources,
    category_id,
    teacher_id,
  } = req.body;
  if (title != null) course.title = title;
  if (description != null) course.description = description;
  if (pricing_type != null || price != null) {
    const nextPrice = price != null ? Number(price) : Number(course.price);
    course.pricing_type = normalizePricingType(pricing_type != null ? pricing_type : course.pricing_type, nextPrice);
  }
  if (is_premium != null) course.is_premium = Boolean(is_premium);
  if (price != null) course.price = Number(price);
  if (sale_price != null || price != null) {
    const nextPrice = price != null ? Number(price) : Number(course.price);
    const nextSaleInput = sale_price != null ? sale_price : course.sale_price;
    course.sale_price = normalizeSalePrice(nextPrice, nextSaleInput);
  }
  if (difficulty_level != null) course.difficulty_level = normalizeDifficultyLevel(difficulty_level);
  if (duration != null) course.duration = Number(duration);
  if (thumbnail != null) course.thumbnail = thumbnail;
  if (teacher_id != null && isAdmin) {
    course.teacher_id = teacher_id;
  }
  if (category_id != null) {
    if (!category_id) {
      course.category_id = null;
    } else {
      const category = await Category.findById(category_id);
      if (!category) return res.status(400).json({ message: 'Invalid category' });
      course.category_id = category._id;
    }
  }
  if (lessons != null || video_url != null) {
    const merged = { ...req.body, video_url: video_url ?? course.video_url };
    course.lessons = normalizeLessons(merged);
    if (course.lessons.length && !req.body.video_url) {
      course.video_url = course.lessons[0].video_url;
    } else if (video_url != null) {
      course.video_url = video_url;
    }
  }
  if (assignments != null) {
    course.assignments = normalizeAssignments({ assignments });
  }
  if (quizzes != null) {
    course.quizzes = normalizeQuizzes({ quizzes });
  }
  if (course_topics != null) {
    course.course_topics = normalizeCourseTopics(course_topics, { courseId: course._id });
  }
  if (all_resources != null) {
    course.all_resources = normalizeResources(all_resources);
  }
  if (topic_resources != null) {
    course.topic_resources = normalizeTopicResources(topic_resources);
  }
  await course.save();
  course.course_topics = (course.course_topics || []).map((topic) => ({
    ...topic.toObject(),
    in_video_quizzes: (topic.in_video_quizzes || []).map((quiz) => ({
      ...quiz.toObject(),
      course_id: course._id,
      topic_id: topic._id,
    })),
  }));
  await course.save();
  const populated = await Course.findById(course._id)
    .populate('teacher_id', 'name email')
    .populate('category_id', 'name slug');
  res.json(populated);
}

async function deleteCourse(req, res) {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  const isOwner = String(course.teacher_id) === String(req.userId);
  const isAdmin = req.userRole === 'admin';
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  await course.deleteOne();
  res.json({ message: 'Course deleted' });
}

module.exports = {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  downloadCourseResource,
};
