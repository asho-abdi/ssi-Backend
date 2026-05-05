const express = require('express');
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', listCategories);
router.post('/', protect, requireRoles('admin'), createCategory);
router.put('/:id', protect, requireRoles('admin'), updateCategory);
router.delete('/:id', protect, requireRoles('admin'), deleteCategory);

module.exports = router;
