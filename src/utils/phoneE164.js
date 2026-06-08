/**
 * Normalize phone numbers for WhatsApp Cloud API (digits only, no leading +).
 */
function normalizeWhatsAppRecipient(raw, defaultCountryCode = '') {
  const input = String(raw || '').trim();
  if (!input) return { ok: false, error: 'Phone number is required' };

  let digits = input.replace(/\D/g, '');
  if (!digits) return { ok: false, error: 'Phone number has no digits' };

  if (!input.startsWith('+') && digits.length <= 10 && defaultCountryCode) {
    digits = `${String(defaultCountryCode).replace(/\D/g, '')}${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, error: 'Phone number length is invalid' };
  }

  return { ok: true, e164: digits };
}

module.exports = { normalizeWhatsAppRecipient };
