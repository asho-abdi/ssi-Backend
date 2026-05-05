const express = require('express');
const { getSettings, updateSection } = require('../controllers/settingsController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect, requireRoles('admin'));

router.get('/', getSettings);
router.patch('/:section', updateSection);

module.exports = router;
