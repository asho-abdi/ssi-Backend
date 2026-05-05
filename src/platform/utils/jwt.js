const jwt = require('jsonwebtoken');

function signAccessToken(user) {
  const payload = { sub: user._id.toString(), role: user.role, email: user.email };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signAccessToken, verifyAccessToken };
