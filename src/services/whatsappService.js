const crypto = require('crypto');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v18.0';

/**
 * Verify X-Hub-Signature-256 from Meta (requires WHATSAPP_APP_SECRET).
 * @param {Buffer} rawBody
 * @param {string|undefined} signatureHeader - req.get('x-hub-signature-256')
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.warn('[whatsapp] WHATSAPP_APP_SECRET not set — signature check skipped');
    return true;
  }
  if (!signatureHeader || !rawBody || !Buffer.isBuffer(rawBody)) {
    return false;
  }
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(String(signatureHeader), 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Send a WhatsApp text message via Cloud API.
 * @param {string} to - E.164 without + (e.g. "15551234567")
 * @param {string} message
 * @returns {Promise<{ ok: boolean, data?: object, error?: string, status?: number }>}
 */
async function sendWhatsAppMessage(to, message) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error('[whatsapp] Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID');
    return { ok: false, error: 'WhatsApp not configured' };
  }

  const cleanTo = String(to || '').replace(/\D/g, '');
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: String(message).slice(0, 4096),
        },
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[whatsapp] Send failed', res.status, data);
      return {
        ok: false,
        error: data?.error?.message || res.statusText,
        status: res.status,
        data,
      };
    }

    console.log('[whatsapp] Message sent to', cleanTo, 'message_id:', data?.messages?.[0]?.id);
    return { ok: true, data };
  } catch (err) {
    console.error('[whatsapp] Send exception:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  verifyWebhookSignature,
  sendWhatsAppMessage,
  GRAPH_VERSION,
};
