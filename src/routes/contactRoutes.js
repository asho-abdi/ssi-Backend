const express = require('express');
const { body } = require('express-validator');
const { protect, requireRoles } = require('../middleware/auth');
const { createContact, getContacts, markRead } = require('../controllers/contactController');

const router = express.Router();

router.post(
  '/',
  [
    body('fullName').trim().notEmpty().isLength({ max: 120 }),
    body('email').isEmail().normalizeEmail(),
    body('phone').optional().trim().isLength({ max: 30 }),
    body('subject').trim().notEmpty().isLength({ max: 200 }),
    body('message').trim().notEmpty().isLength({ max: 5000 }),
  ],
  createContact
);
router.get('/', protect, requireRoles('admin'), getContacts);
router.patch('/:id/read', protect, requireRoles('admin'), markRead);

module.exports = router;
