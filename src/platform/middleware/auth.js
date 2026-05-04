const { User } = require('../models');
const { verifyAccessToken } = require('../utils/jwt');
const { asyncHandler } = require('./asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub).select('_id email role isActive fullName');
  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid authentication state' });
  }
  req.auth = { userId: user._id.toString(), role: user.role, email: user.email };
  req.user = user;
  return next();
});

module.exports = { authenticate };
