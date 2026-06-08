const express = require('express');
const {
  listBundlesAdmin,
  listBundlesPublic,
  getBundle,
  createBundle,
  updateBundle,
  deleteBundle,
  purchaseBundle,
} = require('../controllers/bundleController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/public', listBundlesPublic);
router.get('/public/:id', getBundle);

router.use(protect);

router.get('/', requireRoles('admin'), listBundlesAdmin);
router.get('/:id', requireRoles('admin', 'student'), getBundle);
router.post('/', requireRoles('admin'), createBundle);
router.patch('/:id', requireRoles('admin'), updateBundle);
router.delete('/:id', requireRoles('admin'), deleteBundle);
router.post('/:id/purchase', requireRoles('student', 'admin'), purchaseBundle);

module.exports = router;
