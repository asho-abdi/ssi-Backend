require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { startMongoConnection } = require('./config/db');

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
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();

/** Never trust `Number('')` → 0 → fallback; Railway must use injected PORT exactly. */
function resolveListenPort() {
  const raw = process.env.PORT;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return 5000;
  }
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    console.error('[server] Invalid PORT env; using 5000. Raw:', JSON.stringify(raw));
    return 5000;
  }
  return n;
}

const PORT = resolveListenPort();
/** On Railway, omit host so Node uses the default dual-stack bind (:: + IPv4-mapped). Plain 0.0.0.0 can miss some edge paths → 502. Local dev: force 0.0.0.0 unless LISTEN_HOST is set. */
const IS_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const LISTEN_HOST = process.env.LISTEN_HOST || (IS_RAILWAY ? undefined : '0.0.0.0');

/**
 * Never throw: a thrown error here runs before app.listen() and makes Railway show
 * "Application failed to respond" with a crash loop.
 */
function logProductionEnvWarnings() {
  if (process.env.NODE_ENV !== 'production') return;
  const mongoOk = Boolean(process.env.MONGO_URI || process.env.MONGODB_URI);
  const jwtOk = Boolean(process.env.JWT_SECRET);
  const clientOk = Boolean(process.env.CLIENT_URL);
  const imageKitOk = Boolean(
    String(process.env.IMAGEKIT_PUBLIC_KEY || '').trim() &&
      String(process.env.IMAGEKIT_PRIVATE_KEY || '').trim() &&
      String(process.env.IMAGEKIT_URL_ENDPOINT || '').trim()
  );
  const missing = [];
  if (!mongoOk) missing.push('MONGO_URI or MONGODB_URI');
  if (!jwtOk) missing.push('JWT_SECRET');
  if (!clientOk) missing.push('CLIENT_URL');
  if (!imageKitOk) missing.push('IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT');
  if (missing.length > 0) {
    console.error(
      '[config] Missing env vars (server will still boot; API/DB may not work):',
      missing.join(', ')
    );
  }
}

logProductionEnvWarnings();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ---------------------------------------------------------------------------
// Earliest routes — no CORS/body middleware; always fast for Railway / probes
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => {
  try {
    console.log('[server] GET /');
    res.type('text').send('Backend is LIVE 🚀');
  } catch (err) {
    console.error('[server] GET / error:', err);
    res.status(500).type('text').send('Server error');
  }
});

app.get('/favicon.ico', (_req, res) => {
  try {
    res.status(204).end();
  } catch (err) {
    console.error('[server] favicon error:', err);
    res.status(204).end();
  }
});

app.get('/health', (_req, res) => {
  try {
    res.json({ ok: true });
  } catch (err) {
    console.error('[server] GET /health error:', err);
    res.status(500).json({ ok: false });
  }
});

app.get('/api/health', (_req, res) => {
  try {
    res.json({ ok: true });
  } catch (err) {
    console.error('[server] GET /api/health error:', err);
    res.status(500).json({ ok: false });
  }
});

// ---------------------------------------------------------------------------
// Middleware & API
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: true,
  })
);

app.use('/webhook', webhookRoutes);

app.use(express.json({ limit: '10mb' }));
// Image uploads are served from ImageKit CDN, not local filesystem.

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
  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && status >= 500 ? 'Server error' : err.message || 'Server error';
  res.status(status).json({ message });
});

function listenCallback() {
  console.log(
    `[server] Listening port=${PORT} host=${LISTEN_HOST ?? '(Node default)'} raw_PORT=${JSON.stringify(
      process.env.PORT ?? null
    )} railway=${IS_RAILWAY} NODE_ENV=${process.env.NODE_ENV || 'development'}`
  );
}

if (LISTEN_HOST) {
  app.listen(PORT, LISTEN_HOST, listenCallback);
} else {
  app.listen(PORT, listenCallback);
}

startMongoConnection();
