const express = require('express');
const { myCourses, earnings, earningsConfig } = require('../controllers/teacherController');
const { protect, requirePermissions } = require('../middleware/auth');

const router = express.Router();

router.get('/courses', protect, requirePermissions('editCourse'), myCourses);
router.get('/earnings', protect, requirePermissions('viewEarnings'), earnings);
router.get('/earnings-config', protect, requirePermissions('viewEarnings'), earningsConfig);

module.exports = router;
