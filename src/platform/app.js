const express = require('express');
const { createCorsMiddleware } = require('../config/corsConfig');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.use(createCorsMiddleware());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, service: 'platform-api', time: new Date().toISOString() });
  });

  app.use('/api/v1', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
