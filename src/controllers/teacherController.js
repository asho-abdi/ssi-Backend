const Order = require('../models/Order');
const Course = require('../models/Course');
const { calculateEarnings, getInstructorPercentage } = require('../utils/commission');

async function myCourses(req, res) {
  const courses = await Course.find({ teacher_id: req.userId })
    .populate('category_id', 'name slug')
    .sort({ createdAt: -1 })
    .lean();
  res.json(courses);
}

async function earnings(req, res) {
  const courses = await Course.find({ teacher_id: req.userId }).select('_id title price').lean();
  const ids = courses.map((c) => c._id);
  const instructorPercentage = await getInstructorPercentage();
  const orders = await Order.find({ course_id: { $in: ids }, status: 'paid' })
    .populate('course_id', 'title price')
    .populate('user_id', 'name email')
    .lean();
  const byCourse = {};
  let total = 0;
  let platformTotal = 0;
  orders.forEach((o) => {
    const cid = o.course_id._id.toString();
    const amt = Number(o.amount || 0);
    const split = {
      instructor_earning:
        Number(o.instructor_earning || 0) > 0 ? Number(o.instructor_earning || 0) : calculateEarnings(amt, instructorPercentage).instructor_earning,
      admin_earning:
        Number(o.admin_earning || 0) > 0 ? Number(o.admin_earning || 0) : calculateEarnings(amt, instructorPercentage).admin_earning,
    };
    total += split.instructor_earning;
    platformTotal += split.admin_earning;
    if (!byCourse[cid]) {
      byCourse[cid] = { course: o.course_id, sales: 0, revenue: 0, gross_revenue: 0 };
    }
    byCourse[cid].sales += 1;
    byCourse[cid].revenue += split.instructor_earning;
    byCourse[cid].gross_revenue += amt;
  });
  const recent_transactions = orders
    .slice()
    .sort((a, b) => new Date(b.paid_at || b.createdAt || 0) - new Date(a.paid_at || a.createdAt || 0))
    .slice(0, 20)
    .map((row) => {
      const amount = Number(row.amount || 0);
      const split = {
        instructor_earning:
          Number(row.instructor_earning || 0) > 0 ? Number(row.instructor_earning || 0) : calculateEarnings(amount, instructorPercentage).instructor_earning,
        admin_earning:
          Number(row.admin_earning || 0) > 0 ? Number(row.admin_earning || 0) : calculateEarnings(amount, instructorPercentage).admin_earning,
      };
      return {
        _id: row._id,
        course_id: row.course_id?._id,
        course_title: row.course_id?.title || 'Course',
        student_id: row.user_id?._id,
        student_name: row.user_id?.name || row.user_id?.email || 'Student',
        total_price: amount,
        instructor_earning: split.instructor_earning,
        admin_earning: split.admin_earning,
        instructor_percentage: Number(row.instructor_percentage || instructorPercentage),
        paid_at: row.paid_at || row.createdAt,
      };
    });
  res.json({
    total_revenue: Number(total.toFixed(2)),
    platform_earnings: Number(platformTotal.toFixed(2)),
    orders_count: orders.length,
    instructor_percentage: instructorPercentage,
    breakdown: Object.values(byCourse).map((row) => ({
      ...row,
      revenue: Number(row.revenue.toFixed(2)),
      gross_revenue: Number(row.gross_revenue.toFixed(2)),
    })),
    recent_transactions,
  });
}

async function earningsConfig(_req, res) {
  const instructorPercentage = await getInstructorPercentage();
  res.json({ instructor_percentage: instructorPercentage });
}

module.exports = { myCourses, earnings, earningsConfig };
