const express = require('express');
const { body } = require('express-validator');
const {
  listUsers,
  listUsersGroupedByRole,
  listUsersByRole,
  listInstructorsSummary,
  getStudentReport,
  getInstructorAnalytics,
  createUserByAdmin,
  updateUser,
  updateUserRole,
  updateAccountStatus,
  grantCourseAccess,
  deleteUser,
} = require('../controllers/userController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect, requireRoles('admin'));

router.get('/', listUsers);
router.get('/grouped', listUsersGroupedByRole);
router.get('/role/:role', listUsersByRole);
router.get('/instructors/summary', listInstructorsSummary);
router.get('/instructors/:id/analytics', getInstructorAnalytics);
router.get('/:id/report', getStudentReport);
router.post('/', createUserByAdmin);
router.patch('/:id', updateUser);
router.patch('/:id/role', updateUserRole);
router.patch('/:id/account-status', updateAccountStatus);
router.post(
  '/:id/grant-course',
  [body('course_id').notEmpty(), body('exclude_from_teacher_earnings').optional().isBoolean()],
  grantCourseAccess
);
router.delete('/:id', deleteUser);

module.exports = router;
