const express = require('express');
const { protect, requireRoles } = require('../middleware/auth');
const { createContact, getContacts, markRead } = require('../controllers/contactController');

const router = express.Router();

router.post('/', createContact);
router.get('/', protect, requireRoles('admin'), getContacts);
router.patch('/:id/read', protect, requireRoles('admin'), markRead);

module.exports = router;
