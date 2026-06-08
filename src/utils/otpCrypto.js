const crypto = require('crypto');

function getOtpPepper() {
  return String(process.env.OTP_PEPPER || process.env.JWT_SECRET || 'dev-only-otp-pepper-change-me');
}

function generateNumericOtp(length = 6) {
  const n = Math.floor(Math.random() * 10 ** length);
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
