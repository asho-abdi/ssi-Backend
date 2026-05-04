const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    console.warn('[jwt] JWT_SECRET should be at least 32 characters in production');
  }
  return secret;
}

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    getSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { signToken, getSecret };
