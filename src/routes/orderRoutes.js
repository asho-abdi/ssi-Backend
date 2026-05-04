const express = require('express');
const {
  createOrder,
  payOrder,
  myOrders,
  allOrders,
  getOrder,
} = require('../controllers/orderController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.post('/', protect, requireRoles('student', 'admin'), createOrder);
router.get('/mine', protect, myOrders);
router.get('/all', protect, requireRoles('admin'), allOrders);
router.post('/:id/pay', protect, requireRoles('student', 'admin'), payOrder);
router.get('/:id', protect, getOrder);

module.exports = router;
