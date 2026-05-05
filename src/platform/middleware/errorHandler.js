function notFoundHandler(req, res) {
  return res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, _req, res, _next) {
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation failed',
      errors: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate key', fields: err.keyValue });
  }
  const status = err.status || 500;
  return res.status(status).json({ message: err.message || 'Server error' });
}

module.exports = { notFoundHandler, errorHandler };
