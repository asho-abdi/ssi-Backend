const express = require('express');
const {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  downloadCourseResource,
} = require('../controllers/courseController');
const { protect, requirePermissions } = require('../middleware/auth');

const router = express.Router();

router.get('/', listCourses);
router.get('/:courseId/resources/:resourceId/download', protect, downloadCourseResource);
router.get('/:id', getCourse);

router.post('/', protect, requirePermissions('createCourse', 'publishCourse'), createCourse);
router.put('/:id', protect, requirePermissions('editCourse', 'manageLessons'), updateCourse);
router.delete('/:id', protect, requirePermissions('deleteCourse'), deleteCourse);

module.exports = router;
