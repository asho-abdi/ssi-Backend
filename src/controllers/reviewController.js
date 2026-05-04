const { validationResult } = require('express-validator');
const Review = require('../models/Review');
const Order = require('../models/Order');

async function createOrUpdateReview(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }
  const { course_id, rating, comment } = req.body;
  if (req.userRole !== 'admin') {
    const paid = await Order.findOne({
      user_id: req.userId,
      course_id,
      status: 'paid',
    });
    if (!paid) {
      return res.status(403).json({ message: 'Purchase the course to leave a review' });
    }
  }
  let review = await Review.findOne({ user_id: req.userId, course_id });
  let created = false;
  if (review) {
    review.rating = Number(rating);
    review.comment = comment ?? '';
    await review.save();
  } else {
    created = true;
    review = await Review.create({
      user_id: req.userId,
      course_id,
      rating: Number(rating),
      comment: comment ?? '',
    });
  }
  const populated = await Review.findById(review._id).populate('user_id', 'name');
  res.status(created ? 201 : 200).json(populated);
}

async function listByCourse(req, res) {
  const { courseId } = req.params;
  const reviews = await Review.find({ course_id: courseId })
    .populate('user_id', 'name')
    .sort({ createdAt: -1 })
    .lean();
  const avg =
    reviews.length === 0
      ? 0
      : reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  res.json({ reviews, average_rating: Math.round(avg * 10) / 10, count: reviews.length });
}

async function listAllReviews(_req, res) {
  const reviews = await Review.find({})
    .populate('user_id', 'name email')
    .populate('course_id', 'title')
    .sort({ createdAt: -1 })
    .lean();
  res.json(reviews);
}

async function deleteReview(req, res) {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'Not found' });
  if (review.user_id.toString() !== req.userId && req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  await review.deleteOne();
  res.json({ message: 'Review removed' });
}

module.exports = { createOrUpdateReview, listByCourse, listAllReviews, deleteReview };
