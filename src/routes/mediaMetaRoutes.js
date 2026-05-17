const express = require('express');
const { postVideoDurations } = require('../controllers/mediaMetaController');

const router = express.Router();

router.post('/video-durations', postVideoDurations);

module.exports = router;
