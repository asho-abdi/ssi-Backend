const { verifyWebhookSignature, sendWhatsAppMessage } = require('../services/whatsappService');
const { getAiReply } = require('../services/openaiService');

/**
 * GET /webhook — Meta webhook verification
 * hub.mode, hub.verify_token, hub.challenge
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.VERIFY_TOKEN;

  console.log('[whatsapp] Verification request', {
    mode,
    hasToken: Boolean(token),
    hasChallenge: Boolean(challenge),
  });

  if (mode !== 'subscribe') {
    return res.status(400).send('Bad Request');
  }

  if (!verifyToken) {
    console.error('[whatsapp] VERIFY_TOKEN is not set');
    return res.status(500).send('Server misconfigured');
  }

  if (token !== verifyToken) {
    console.warn('[whatsapp] Verification failed — token mismatch');
    return res.status(403).send('Forbidden');
  }

  if (!challenge) {
    return res.status(400).send('Missing challenge');
  }

  console.log('[whatsapp] Webhook verified');
  return res.status(200).send(challenge);
}

/**
 * Middleware: parse raw Buffer to JSON after express.raw()
 */
function parseWebhookBody(req, res, next) {
  if (!Buffer.isBuffer(req.body)) {
    console.warn('[whatsapp] POST body is not raw buffer');
    req.webhookPayload = typeof req.body === 'object' ? req.body : {};
    req.rawBodyBuffer = Buffer.from(JSON.stringify(req.body || {}));
    return next();
  }

  req.rawBodyBuffer = req.body;

  try {
    const text = req.body.toString('utf8') || '{}';
    req.webhookPayload = JSON.parse(text);
  } catch (e) {
    console.error('[whatsapp] Invalid JSON body:', e.message);
    return res.status(400).json({ message: 'Invalid JSON' });
  }

  next();
}

/**
 * Middleware: validate Meta signature when WHATSAPP_APP_SECRET is set
 */
function validateSignature(req, res, next) {
  const sig = req.get('x-hub-signature-256');
  if (!verifyWebhookSignature(req.rawBodyBuffer, sig)) {
    console.warn('[whatsapp] Invalid or missing webhook signature');
    return res.status(403).json({ message: 'Invalid signature' });
  }
  next();
}

/**
 * Extract text messages from WhatsApp Cloud API payload
 */
function extractIncomingTexts(payload) {
  const results = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value) continue;

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        if (msg?.type === 'text' && msg?.text?.body) {
          results.push({
            messageId: msg.id,
            from: msg.from,
            text: msg.text.body,
            timestamp: msg.timestamp,
          });
        }
      }
    }
  }

  return results;
}

/**
 * POST /webhook
 */
async function receiveWebhook(req, res) {
  try {
    const payload = req.webhookPayload;

    if (!payload || typeof payload !== 'object') {
      console.warn('[whatsapp] Empty webhook payload');
      if (!res.headersSent) return res.status(400).json({ message: 'Invalid payload' });
      return;
    }

    if (payload.object !== 'whatsapp_business_account') {
      console.log('[whatsapp] Ignoring non-WhatsApp object:', payload.object);
      if (!res.headersSent) return res.sendStatus(200);
      return;
    }

    const incoming = extractIncomingTexts(payload);

    if (incoming.length === 0) {
      console.log('[whatsapp] No text messages in payload (statuses or empty) — ack');
      if (!res.headersSent) return res.sendStatus(200);
      return;
    }

    res.sendStatus(200);

    for (const item of incoming) {
      const { from, text, messageId } = item;
      console.log('[whatsapp] Inbound message', { from, messageId, preview: text?.slice(0, 120) });

      try {
        const reply = await getAiReply(text);
        const sent = await sendWhatsAppMessage(from, reply);
        if (!sent.ok) {
          console.error('[whatsapp] Outbound failed', sent.error);
        }
      } catch (err) {
        console.error('[whatsapp] Process message error:', err.message);
      }
    }
  } catch (err) {
    console.error('[whatsapp] Webhook handler error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  }
}

module.exports = {
  verifyWebhook,
  parseWebhookBody,
  validateSignature,
  receiveWebhook,
};
