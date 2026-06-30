/**
 * Course duration calculation utilities.
 *
 * Lesson.duration is a freeform string stored by the instructor, e.g.:
 *   "20:00"   → 20 minutes
 *   "1:30:00" → 1 hour 30 minutes
 *   "45 min"  → 45 minutes
 *   "1h 20m"  → 1 hour 20 minutes
 *   "90"      → 90 minutes (bare number assumed minutes)
 */

/**
 * Parse a lesson duration string to total seconds.
 * Returns 0 if the string is empty or unparseable.
 */
function parseLessonDurationSeconds(input) {
  if (!input) return 0;
  const raw = String(input).trim();
  if (!raw) return 0;

  const compact = raw.replace(/\s*:\s*/g, ':');

  // H:MM:SS
  const triple = compact.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (triple) {
    const h = Number(triple[1]);
    const m = Number(triple[2]);
    const s = Number(triple[3]);
    if (m >= 60 || s >= 60) return 0;
    return h * 3600 + m * 60 + s;
  }

  // M:SS
  const pair = compact.match(/^(\d+):(\d{1,2})$/);
  if (pair) {
    const minutes = Number(pair[1]);
    const seconds = Number(pair[2]);
    if (seconds >= 60) return 0;
    return minutes * 60 + seconds;
  }

  // "1h 20m" / "1h20m" / "2h 5min"
  const hm = raw.match(/^(\d+)\s*h(?:ours?)?\s*(?:(\d+)\s*(?:m|min|minutes?))?$/i);
  if (hm) {
    const h = Number(hm[1]);
    const m = hm[2] != null ? Number(hm[2]) : 0;
    return h * 3600 + m * 60;
  }

  // "12.5 min" / "12 min" / "12 minutes"
  const minMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/i);
  if (minMatch) {
    return Math.round(Number(minMatch[1]) * 60);
  }

  // "90 sec" / "90 seconds"
  const secMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:sec(?:ond)?s?)\b/i);
  if (secMatch) {
    return Math.round(Number(secMatch[1]));
  }

  // Bare number: treat as minutes
  const bare = Number(raw);
  if (Number.isFinite(bare) && bare > 0) {
    return Math.round(bare * 60);
  }

  return 0;
}

/**
 * Sum all lesson durations across course_topics and the top-level lessons array.
 * Returns total in minutes (integer).
 */
function calcCourseMinutes(courseDoc) {
  let totalSeconds = 0;

  for (const topic of courseDoc.course_topics || []) {
    for (const lesson of topic.lessons || []) {
      totalSeconds += parseLessonDurationSeconds(lesson.duration);
    }
  }

  for (const lesson of courseDoc.lessons || []) {
    totalSeconds += parseLessonDurationSeconds(lesson.duration);
  }

  return Math.round(totalSeconds / 60);
}

/**
 * Format total minutes as a human-readable label.
 * Examples: "8h 45m", "1h", "45m"
 */
function formatDurationLabel(totalMinutes) {
  if (!totalMinutes || !Number.isFinite(totalMinutes) || totalMinutes <= 0) return null;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Format total minutes as decimal hours, e.g. 90 → 1.5
 */
function minutesToHours(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return 0;
  return Math.round((totalMinutes / 60) * 10) / 10;
}

module.exports = {
  parseLessonDurationSeconds,
  calcCourseMinutes,
  formatDurationLabel,
  minutesToHours,
};
