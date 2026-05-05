const express = require('express');
const { body } = require('express-validator');
const {
  createOrUpdateReview,
  listByCourse,
  listAllReviews,
  deleteReview,
} = require('../controllers/reviewController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/course/:courseId', listByCourse);
router.get('/all', protect, requireRoles('admin'), listAllReviews);
router.post(
  '/',
  protect,
  requireRoles('student', 'admin'),
  [
    body('course_id').notEmpty(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').optional().isString(),
  ],
  createOrUpdateReview
);
router.delete('/:id', protect, deleteReview);

module.exports = router;
