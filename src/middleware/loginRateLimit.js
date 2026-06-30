const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 10);
const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000);
const LOCK_MS = Number(process.env.LOGIN_LOCK_MS || 15 * 60 * 1000);

/** ip -> { attempts: number[], lockedUntil: number } */
const buckets = new Map();

function pruneAttempts(attempts, now) {
  return attempts.filter((ts) => now - ts < WINDOW_MS);
}

function loginRateLimit(req, res, next) {
  const ip = String(req.ip || req.connection?.remoteAddress || 'unknown');
  const now = Date.now();
  const bucket = buckets.get(ip) || { attempts: [], lockedUntil: 0 };

  if (bucket.lockedUntil > now) {
    const retrySec = Math.ceil((bucket.lockedUntil - now) / 1000);
    return res.status(429).json({
      message: `Too many login attempts. Try again in ${retrySec} seconds.`,
    });
  }

  bucket.attempts = pruneAttempts(bucket.attempts, now);
  buckets.set(ip, bucket);
  req._loginRateBucket = bucket;
  req._loginRateIp = ip;
  next();
}

function recordFailedLogin(req) {
  const ip = req._loginRateIp;
  if (!ip) return;
  const bucket = buckets.get(ip);
  if (!bucket) return;
  const now = Date.now();
  bucket.attempts = pruneAttempts(bucket.attempts, now);
  bucket.attempts.push(now);
  if (bucket.attempts.length >= MAX_ATTEMPTS) {
    bucket.lockedUntil = now + LOCK_MS;
    bucket.attempts = [];
  }
  buckets.set(ip, bucket);
}

function clearLoginAttempts(req) {
  const ip = req._loginRateIp;
  if (ip) buckets.delete(ip);
}

module.exports = { loginRateLimit, recordFailedLogin, clearLoginAttempts };
