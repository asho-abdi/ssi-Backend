const axios = require('axios');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

function isConfigured() {
  return Boolean(
    (process.env.WHATSAPP_TOKEN || '').trim() &&
      (process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || '').trim()
  );
}

function getPhoneNumberId() {
  return (process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || '').trim();
}

function getToken() {
  return (process.env.WHATSAPP_TOKEN || '').trim();
}

async function sendPasswordResetOtp({ to, code, expiresMinutes }) {
  if (!isConfigured()) {
    console.warn('[whatsapp-otp] Not configured');
    return { ok: false, error: 'WhatsApp is not configured' };
  }

  const cleanTo = String(to || '').replace(/\D/g, '');
  if (!cleanTo) return { ok: false, error: 'Invalid phone number' };

  const body = `Your SSI password reset code is: ${code}\nIt expires in ${expiresMinutes} minutes.`;

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${getPhoneNumberId()}/messages`;
    const res = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: cleanTo,
        type: 'text',
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return { ok: true, messageId: res.data?.messages?.[0]?.id };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message || 'WhatsApp send failed';
    console.error('[whatsapp-otp]', msg);
    return { ok: false, error: msg };
  }
}

module.exports = { isConfigured, sendPasswordResetOtp };
