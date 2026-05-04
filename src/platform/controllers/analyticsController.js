const { asyncHandler } = require('../middleware/asyncHandler');
const { AnalyticsDaily, AnalyticsCourse } = require('../models');
const { getPagination, buildPaginatedResponse } = require('../utils/pagination');

const listDaily = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [total, docs] = await Promise.all([
    AnalyticsDaily.countDocuments({}),
    AnalyticsDaily.find({}).sort({ date: -1 }).skip(skip).limit(limit).lean(),
  ]);
  return res.json(buildPaginatedResponse({ docs, total, page, limit }));
});

const listCourses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [total, docs] = await Promise.all([
    AnalyticsCourse.countDocuments({}),
    AnalyticsCourse.find({}).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('courseId').lean(),
  ]);
  return res.json(buildPaginatedResponse({ docs, total, page, limit }));
});

module.exports = { listDaily, listCourses };
