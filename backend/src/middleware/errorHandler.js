/**
 * Centralized error handler. Any `next(err)` call in the app lands here.
 */
function errorHandler(err, req, res, next) {
  console.error(err);

  // Postgres unique_violation
  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with that value already exists' });
  }

  // Postgres foreign_key_violation
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Related record not found' });
  }

  const status = err.status || 500;
  const message = err.expose ? err.message : (status === 500 ? 'Internal server error' : err.message);

  res.status(status).json({ error: message });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };
