const express = require('express');
const { mediaMetaLimiter } = require('../middleware/security');
const { postVideoDurations } = require('../controllers/mediaMetaController');

const router = express.Router();

router.post('/video-durations', mediaMetaLimiter, postVideoDurations);

module.exports = router;
