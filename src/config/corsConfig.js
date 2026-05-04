const cors = require('cors');

const DEFAULT_DEV_ORIGIN = 'http://localhost:5173';

/** Comma-separated CLIENT_ORIGIN or CLIENT_URL — first is primary (email links, redirects). */
function getAllowedOriginList() {
  const raw = process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || '';
  const parts = raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return parts.length ? parts : [DEFAULT_DEV_ORIGIN];
}

function getPrimaryClientOrigin() {
  const list = getAllowedOriginList();
  return list[0] || DEFAULT_DEV_ORIGIN;
}

function createCorsMiddleware() {
  const allowed = new Set(getAllowedOriginList());

  return cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowed.has(origin)) {
        return callback(null, true);
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[cors] Blocked origin:', origin, '| Allowed:', [...allowed]);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}

module.exports = { getAllowedOriginList, getPrimaryClientOrigin, createCorsMiddleware, DEFAULT_DEV_ORIGIN };
