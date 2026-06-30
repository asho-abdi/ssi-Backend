/**
 * Browser app origins: CLIENT_URL (comma-separated).
 * Used for CORS and auth redirect/email base URLs.
 */

function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function parseClientOrigins() {
  const raw = String(process.env.CLIENT_URL || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

function isAllowedVercelPreview(originHost, allowedOrigins) {
  const host = String(originHost || '').toLowerCase();
  if (!host.endsWith('.vercel.app')) return false;

  for (const allowed of allowedOrigins) {
    try {
      const allowedHost = new URL(allowed).hostname.toLowerCase();
      if (!allowedHost.endsWith('.vercel.app')) continue;
      const prefix = allowedHost.slice(0, -'.vercel.app'.length);
      if (!prefix) continue;
      if (host === allowedHost || host.startsWith(`${prefix}-`)) {
        return true;
      }
    } catch {
      /* ignore invalid CLIENT_URL entry */
    }
  }
  return false;
}

/**
 * Returns a cors `origin` option: string | string[] | function | false
 */
function getCorsOriginOption() {
  const allowedOrigins = parseClientOrigins();

  if (allowedOrigins.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return 'http://localhost:5173';
  }

  if (allowedOrigins.length === 1 && process.env.NODE_ENV !== 'production') {
    return allowedOrigins[0];
  }

  return function corsOrigin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.includes(normalized)) {
      callback(null, true);
      return;
    }
    try {
      const host = new URL(normalized).hostname;
      if (isAllowedVercelPreview(host, allowedOrigins)) {
        callback(null, true);
        return;
      }
    } catch {
      /* invalid Origin header */
    }
    callback(null, false);
  };
}

/** First origin in CLIENT_URL (for password-reset / verify links). */
function getPrimaryClientUrl() {
  const origins = parseClientOrigins();
  if (origins.length > 0) return origins[0];
  return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173';
}

module.exports = {
  getCorsOriginOption,
  getPrimaryClientUrl,
  parseClientOrigins,
  isAllowedVercelPreview,
};