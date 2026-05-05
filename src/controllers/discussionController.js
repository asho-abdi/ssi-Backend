const mongoose = require('mongoose');
const Course = require('../models/Course');
const Order = require('../models/Order');
const { Enrollment } = require('../models/Enrollment');
const CourseDiscussionThread = require('../models/CourseDiscussionThread');
const CourseAnnouncement = require('../models/CourseAnnouncement');
const { notifyUsers } = require('../utils/notificationService');
const { logAuditEvent } = require('../utils/auditLog');

async function canAccessCourse(req, course) {
  if (!course) return false;
  if (req.userRole === 'admin' || req.userRole === 'editor') return true;
  if (req.userRole === 'teacher' && String(course.teacher_id) === String(req.userId)) return true;
  const [enrollment, paid] = await Promise.all([
    Enrollment.findOne({ student_id: req.userId, course_id: course._id, status: 'approved' }).lean(),
    Order.findOne({ user_id: req.userId, course_id: course._id, status: 'paid' }).lean(),
  ]);
  return Boolean(enrollment || paid);
}

async function loadCourseForRequest(req, res) {
  const courseId = String(req.params.courseId || '');
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    res.status(400).json({ message: 'Invalid course id' });
    return null;
  }
  const course = await Course.findById(courseId).select('title teacher_id lessons').lean();
  if (!course) {
    res.status(404).json({ message: 'Course not found' });
    return null;
  }
  return course;
}

async function listCourseDiscussions(req, res) {
  const course = await loadCourseForRequest(req, res);
  if (!course) return;
  if (!(await canAccessCourse(req, course))) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const rows = await CourseDiscussionThread.find({ course_id: course._id })
    .sort({ is_resolved: 1, updatedAt: -1 })
    .populate('author_id', 'name role')
    .populate('replies.author_id', 'name role')
    .lean();
  res.json(rows);
}

async function createDiscussionThread(req, res) {
  const course = await loadCourseForRequest(req, res);
  if (!course) return;
  if (!(await canAccessCourse(req, course))) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const title = String(req.body?.title || '').trim();
  const question = String(req.body?.question || '').trim();
  if (!title || !question) {
    return res.status(400).json({ message: 'title and question are required' });
  }
  const lessonIdRaw = String(req.body?.lesson_id || '').trim();
  const lessonId = lessonIdRaw && mongoose.Types.ObjectId.isValid(lessonIdRaw) ? lessonIdRaw : null;
  const thread = await CourseDiscussionThread.create({
    course_id: course._id,
    lesson_id: lessonId,
    author_id: req.userId,
    title,
    question,
    replies: [],
  });
  await logAuditEvent(req, {
    action: 'discussion.thread_create',
    target_type: 'discussion_thread',
    target_id: thread._id,
    details: { course_id: course._id, title },
  });
  if (String(course.teacher_id) !== String(req.userId)) {
    await notifyUsers([course.teacher_id], {
      type: 'discussion_new_thread',
      title: `New question in ${course.title}`,
      message: title,
      link: `/watch/${course._id}`,
      meta: { thread_id: thread._id, course_id: course._id },
    });
  }
  const populated = await CourseDiscussionThread.findById(thread._id)
    .populate('author_id', 'name role')
    .populate('replies.author_id', 'name role')
    .lean();
  res.status(201).json(populated);
}

async function replyDiscussionThread(req, res) {
  const threadId = String(req.params.threadId || '');
  if (!mongoose.Types.ObjectId.isValid(threadId)) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }
  const thread = await CourseDiscussionThread.findById(threadId);
  if (!thread) return res.status(404).json({ message: 'Thread not found' });
  const course = await Course.findById(thread.course_id).select('title teacher_id').lean();
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!(await canAccessCourse(req, course))) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ message: 'message is required' });
  thread.replies.push({ author_id: req.userId, message });
  await thread.save();
  await logAuditEvent(req, {
    action: 'discussion.thread_reply',
    target_type: 'discussion_thread',
    target_id: thread._id,
    details: { course_id: thread.course_id },
  });

  const recipientIds = new Set();
  if (String(thread.author_id) !== String(req.userId)) recipientIds.add(String(thread.author_id));
  thread.replies.forEach((reply) => {
    if (String(reply.author_id) !== String(req.userId)) recipientIds.add(String(reply.author_id));
  });
  if (String(course.teacher_id) !== String(req.userId)) recipientIds.add(String(course.teacher_id));
  await notifyUsers([...recipientIds], {
    type: 'discussion_new_reply',
    title: `New reply in ${course.title}`,
    message: thread.title,
    link: `/watch/${course._id}`,
    meta: { thread_id: thread._id, course_id: course._id },
  });

  const populated = await CourseDiscussionThread.findById(thread._id)
    .populate('author_id', 'name role')
    .populate('replies.author_id', 'name role')
    .lean();
  res.json(populated);
}

async function toggleResolveDiscussionThread(req, res) {
  const threadId = String(req.params.threadId || '');
  if (!mongoose.Types.ObjectId.isValid(threadId)) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }
  const thread = await CourseDiscussionThread.findById(threadId);
  if (!thread) return res.status(404).json({ message: 'Thread not found' });
  const course = await Course.findById(thread.course_id).select('teacher_id').lean();
  if (!course) return res.status(404).json({ message: 'Course not found' });
  const isOwnerTeacher = req.userRole === 'teacher' && String(course.teacher_id) === String(req.userId);
  const isAdmin = req.userRole === 'admin';
  if (!isOwnerTeacher && !isAdmin) {
    return res.status(403).json({ message: 'Only course instructor or admin can change resolution status' });
  }
  thread.is_resolved = req.body?.is_resolved != null ? Boolean(req.body.is_resolved) : !thread.is_resolved;
  await thread.save();
  await logAuditEvent(req, {
    action: 'discussion.thread_resolve_toggle',
    target_type: 'discussion_thread',
    target_id: thread._id,
    details: { is_resolved: thread.is_resolved },
  });
  res.json(thread);
}

async function listCourseAnnouncements(req, res) {
  const course = await loadCourseForRequest(req, res);
  if (!course) return;
  if (!(await canAccessCourse(req, course))) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const rows = await CourseAnnouncement.find({ course_id: course._id, is_active: true })
    .sort({ createdAt: -1 })
    .populate('created_by', 'name role')
    .lean();
  res.json(rows);
}

async function createCourseAnnouncement(req, res) {
  const course = await loadCourseForRequest(req, res);
  if (!course) return;
  const isAdmin = req.userRole === 'admin';
  const isCourseTeacher = req.userRole === 'teacher' && String(course.teacher_id) === String(req.userId);
  if (!isAdmin && !isCourseTeacher) {
    return res.status(403).json({ message: 'Only the course instructor or admin can post announcements' });
  }
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!title || !message) return res.status(400).json({ message: 'title and message are required' });
  const priority = ['low', 'normal', 'high'].includes(String(req.body?.priority || '').toLowerCase())
    ? String(req.body.priority).toLowerCase()
    : 'normal';
  const announcement = await CourseAnnouncement.create({
    course_id: course._id,
    created_by: req.userId,
    title,
    message,
    priority,
    is_active: true,
  });

  const [enrolledRows, paidRows] = await Promise.all([
    Enrollment.find({ course_id: course._id, status: 'approved' }).select('student_id').lean(),
    Order.find({ course_id: course._id, status: 'paid' }).select('user_id').lean(),
  ]);
  const recipientIds = new Set();
  enrolledRows.forEach((row) => recipientIds.add(String(row.student_id)));
  paidRows.forEach((row) => recipientIds.add(String(row.user_id)));
  recipientIds.delete(String(req.userId));
  await notifyUsers([...recipientIds], {
    type: 'course_announcement',
    title: `${course.title}: ${title}`,
    message,
    link: `/watch/${course._id}`,
    meta: { course_id: course._id, announcement_id: announcement._id },
  });

  await logAuditEvent(req, {
    action: 'course.announcement_create',
    target_type: 'course_announcement',
    target_id: announcement._id,
    details: { course_id: course._id, title },
  });
  const populated = await CourseAnnouncement.findById(announcement._id).populate('created_by', 'name role').lean();
  res.status(201).json(populated);
}

module.exports = {
  listCourseDiscussions,
  createDiscussionThread,
  replyDiscussionThread,
  toggleResolveDiscussionThread,
  listCourseAnnouncements,
  createCourseAnnouncement,
};
