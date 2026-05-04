require('dotenv').config();
const express = require('express');
const path = require('path');
const { connectDB } = require('./config/db');
const { createCorsMiddleware, getAllowedOriginList } = require('./config/corsConfig');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const courseRoutes = require('./routes/courseRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const progressRoutes = require('./routes/progressRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const statsRoutes = require('./routes/statsRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const monetizationRoutes = require('./routes/monetizationRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const discussionRoutes = require('./routes/discussionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const announcementRoutes = require('./routes/announcementRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 5000;

function ensureProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const mongoOk = Boolean(process.env.MONGODB_URI || process.env.MONGO_URI);
  const clientOk = Boolean(process.env.CLIENT_ORIGIN || process.env.CLIENT_URL);
  const jwtOk = Boolean(process.env.JWT_SECRET);
  const missing = [];
  if (!mongoOk) missing.push('MONGODB_URI or MONGO_URI');
  if (!clientOk) missing.push('CLIENT_ORIGIN or CLIENT_URL');
  if (!jwtOk) missing.push('JWT_SECRET');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

ensureProductionEnv();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(createCorsMiddleware());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads/images', express.static(path.join(__dirname, '..', 'uploads', 'images')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'development', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/monetization', monetizationRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/announcements', announcementRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[api] Error:', err.message || err);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'CORS: origin not allowed' });
  }
  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && status >= 500 ? 'Server error' : err.message || 'Server error';
  res.status(status).json({ message });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[api] Express listening on port ${PORT}`);
      console.log(`[api] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
      console.log('[api] CORS allowed origins:', getAllowedOriginList().join(', '));
    });
  })
  .catch((e) => {
    console.error('[db] Connection failed:', e.message);
    process.exit(1);
  });
