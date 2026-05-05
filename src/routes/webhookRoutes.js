const express = require('express');
const {
  verifyWebhook,
  parseWebhookBody,
  validateSignature,
  receiveWebhook,
} = require('../controllers/webhookController');

const router = express.Router();

const rawJsonParser = express.raw({ type: 'application/json' });

router.get('/', verifyWebhook);
router.post('/', rawJsonParser, parseWebhookBody, validateSignature, (req, res, next) => {
  Promise.resolve(receiveWebhook(req, res)).catch(next);
});

module.exports = router;
