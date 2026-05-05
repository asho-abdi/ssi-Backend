const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { normalizePermissions, hasPermission } = require('../utils/permissions');
const { getSecret } = require('../utils/jwt');

function protect(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
  try {
    const token = header.split(' ')[1];
    const secret = getSecret();
    const decoded = jwt.verify(token, secret);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired, please sign in again' });
    }
    return res.status(401).json({ message: 'Not authorized, invalid token' });
  }
}

/** Loads full user doc; optional for routes that need role from DB */
async function attachUser(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    const role = req.userRole;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}

function requirePermissions(...permissions) {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userId).select('role permissions').lean();
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }
      req.userRole = user.role;
      req.userPermissions = normalizePermissions(user.permissions, user.role);
      if (user.role === 'admin') return next();
      const allowed = permissions.every((perm) => hasPermission(req.userPermissions, perm));
      if (!allowed) {
        return res.status(403).json({ message: 'Forbidden: missing permission' });
      }
      return next();
    } catch (e) {
      return res.status(500).json({ message: 'Server error' });
    }
  };
}

module.exports = { protect, attachUser, requireRoles, requirePermissions };
