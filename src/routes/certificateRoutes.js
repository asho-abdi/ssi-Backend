const express = require('express');
const {
  listMine,
  listAllAdmin,
  getTemplate,
  updateTemplate,
  getForCourse,
  downloadPdf,
  verifyPublic,
} = require('../controllers/certificateController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/verify/:serial', verifyPublic);
router.get('/verify', verifyPublic);
router.get('/', protect, requireRoles('student', 'admin'), listMine);
router.get('/all', protect, requireRoles('admin'), listAllAdmin);
router.get('/template', protect, requireRoles('admin'), getTemplate);
router.put('/template', protect, requireRoles('admin'), updateTemplate);
router.get('/course/:courseId', protect, requireRoles('student', 'admin'), getForCourse);
router.get('/course/:courseId/pdf', protect, requireRoles('student', 'admin'), downloadPdf);

module.exports = router;
