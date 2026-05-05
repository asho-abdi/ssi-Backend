const express = require('express');
const {
  listUsers,
  listUsersGroupedByRole,
  listUsersByRole,
  getStudentReport,
  createUserByAdmin,
  updateUser,
  updateUserRole,
  grantCourseAccess,
  deleteUser,
} = require('../controllers/userController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect, requireRoles('admin'));

router.get('/', listUsers);
router.get('/grouped', listUsersGroupedByRole);
router.get('/role/:role', listUsersByRole);
router.get('/:id/report', getStudentReport);
router.post('/', createUserByAdmin);
router.patch('/:id', updateUser);
router.patch('/:id/role', updateUserRole);
router.post('/:id/grant-course', grantCourseAccess);
router.delete('/:id', deleteUser);

module.exports = router;
