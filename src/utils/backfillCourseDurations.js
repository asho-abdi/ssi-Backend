const Course = require('../models/Course');
const { calcCourseMinutes, minutesToHours } = require('./courseDuration');

let backfillStarted = false;

/**
 * Recalculate total_minutes and duration for all courses from lesson content.
 * Runs once per process after MongoDB connects (safe for existing courses).
 */
async function backfillCourseDurations() {
  if (backfillStarted) return;
  backfillStarted = true;

  try {
    const courses = await Course.find({}).select('_id course_topics lessons duration total_minutes');
    let updated = 0;

    for (const course of courses) {
      const mins = calcCourseMinutes(course);
      const nextDuration = mins > 0 ? minutesToHours(mins) : course.duration;
      const changed =
        mins !== Number(course.total_minutes) ||
        (mins > 0 && Number(course.duration) !== nextDuration);

      if (!changed) continue;

      course.total_minutes = mins;
      if (mins > 0) course.duration = nextDuration;
      await course.save();
      updated += 1;
    }

    if (updated > 0) {
      console.log(`[courses] Recalculated duration for ${updated} course(s)`);
    }
  } catch (err) {
    console.warn('[courses] Duration backfill failed:', err.message || err);
    backfillStarted = false;
  }
}

module.exports = { backfillCourseDurations };
