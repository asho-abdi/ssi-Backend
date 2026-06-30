const Course = require('../models/Course');

function courseHasLessons(course) {
  const top = Array.isArray(course?.lessons) ? course.lessons.length : 0;
  const inTopics = (course?.course_topics || []).some((t) => (t?.lessons || []).length > 0);
  return top > 0 || inTopics;
}

/** Existing courses with content stay live after is_published is introduced. */
async function backfillCoursePublished() {
  const courses = await Course.find({
    $or: [{ is_published: { $exists: false } }, { is_published: false }],
  })
    .select('lessons course_topics is_published')
    .lean();

  const ids = courses.filter(courseHasLessons).map((c) => c._id);
  if (ids.length === 0) return { updated: 0 };

  const result = await Course.updateMany({ _id: { $in: ids } }, { $set: { is_published: true } });
  console.log(`[courses] Published backfill: ${result.modifiedCount} course(s) marked live`);
  return { updated: result.modifiedCount };
}

module.exports = { backfillCoursePublished };
