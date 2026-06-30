const helmet = require('helmet');
const compression = require('compression');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const { getCorsOriginOption } = require('../config/clientUrl');

const isProd = process.env.NODE_ENV === 'production';

const globalApiLimiter = rateLimit({
  windowMs: Number(process.env.API_RATE_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.API_RATE_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication requests. Please try again later.' },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.CONTACT_RATE_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many contact submissions. Please try again later.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REGISTER_RATE_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Please try again later.' },
});

const mediaMetaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MEDIA_META_RATE_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many media requests. Please try again later.' },
});

function applySecurityMiddleware(app) {
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(compression());

  const corsOrigin = getCorsOriginOption();
  const cors = require('cors');
  app.use(
    cors({
      origin: corsOrigin,
      credentials: false,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    })
  );

  app.use(hpp());
}

function sanitizeInput(req, res, next) {
  return mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req: request, key }) => {
      if (isProd) {
        console.warn('[security] Sanitized prohibited key:', key, 'path:', request.path);
      }
    },
  })(req, res, next);
}

module.exports = {
  applySecurityMiddleware,
  sanitizeInput,
  globalApiLimiter,
  authLimiter,
  contactLimiter,
  registerLimiter,
  mediaMetaLimiter,
};
