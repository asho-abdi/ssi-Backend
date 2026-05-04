/**
 * Single env var for the browser app: CLIENT_URL (comma-separated for multiple origins).
 * Used for CORS and auth redirect/email base URLs.
 */
function getCorsOriginOption() {
  const raw = String(process.env.CLIENT_URL || '').trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return 'http://localhost:5173';
  }
  if (raw.includes(',')) {
    return raw
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);
  }
  return raw.replace(/\/+$/, '');
}

/** First origin in CLIENT_URL (for password-reset / verify links). */
function getPrimaryClientUrl() {
  const raw = String(process.env.CLIENT_URL || '').trim();
  if (!raw) {
    return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173';
  }
  return raw.split(',')[0].trim().replace(/\/+$/, '');
}

module.exports = { getCorsOriginOption, getPrimaryClientUrl };
