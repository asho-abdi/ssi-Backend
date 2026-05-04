const { User, enums } = require('../models');
const { asyncHandler } = require('../middleware/asyncHandler');
const { signAccessToken } = require('../utils/jwt');

const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, role = 'student', phone, profileImage, bio } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'fullName, email and password are required' });
  }
  if (!enums.roles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) return res.status(409).json({ message: 'Email already exists' });

  const user = new User({
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    role,
    phone,
    profileImage,
    bio,
  });
  await user.setPassword(password);
  await user.save();

  const token = signAccessToken(user);
  return res.status(201).json({
    token,
    user: {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'email and password are required' });

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' });

  const ok = await user.comparePassword(password);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  const token = signAccessToken(user);
  return res.json({
    token,
    user: {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
  });
});

const me = asyncHandler(async (req, res) => {
  return res.json(req.user);
});

module.exports = { register, login, me };
