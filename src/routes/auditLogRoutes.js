const express = require('express');
const { listAuditLogs } = require('../controllers/auditLogController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, requireRoles('admin'), listAuditLogs);

module.exports = router;
