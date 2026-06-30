const crypto = require('crypto');

function getOtpPepper() {
  const pepper = process.env.OTP_PEPPER || process.env.JWT_SECRET;
  if (!pepper) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('OTP_PEPPER or JWT_SECRET must be configured');
    }
    return 'dev-only-otp-pepper-change-me';
  }
  return String(pepper);
}

function generateNumericOtp(length = 6) {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(length, '0');
}

function hashOtpCode(code) {
  return crypto.createHash('sha256').update(`${getOtpPepper()}:${String(code || '')}`).digest('hex');
}

function hashResetSession(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function issueResetSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateNumericOtp,
  hashOtpCode,
  hashResetSession,
  issueResetSessionToken,
};
