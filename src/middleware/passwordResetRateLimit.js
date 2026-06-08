const MAX_PER_WINDOW = Number(process.env.OTP_MAX_PER_HOUR || 5);
const WINDOW_MS = 60 * 60 * 1000;

const buckets = new Map();

function prune(key) {
  const now = Date.now();
  const entries = buckets.get(key) || [];
  const fresh = entries.filter((ts) => now - ts < WINDOW_MS);
  if (fresh.length === 0) buckets.delete(key);
  else buckets.set(key, fresh);
  return fresh;
}

function passwordResetRateLimit(req, res, next) {
  const ip = String(req.ip || req.connection?.remoteAddress || 'unknown');
  const identifier = String(req.body?.email || req.body?.phone || req.body?.identifier || '').toLowerCase();
  const key = `${ip}:${identifier || 'none'}`;
  const recent = prune(key);
  if (recent.length >= MAX_PER_WINDOW) {
    return res.status(429).json({
      message: 'Too many password reset attempts. Please try again later.',
    });
  }
  recent.push(Date.now());
  buckets.set(key, recent);
  next();
}

module.exports = { passwordResetRateLimit };
