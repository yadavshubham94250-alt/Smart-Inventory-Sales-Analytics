// Central error handling: every failure leaves the API as { success:false, error:{...} }.
const env = require('../config/env');
const { AppError } = require('../utils/errors');

function notFound(req, _res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = 'Something went wrong on the server.';
  let details;

  if (err instanceof AppError) {
    ({ status, message, details } = err);
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Request body is not valid JSON.';
  } else if (err.type === 'entity.too.large') {
    status = 413; message = 'Request body is too large.';
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409; message = 'A record with the same unique value already exists.';
  } else if (err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT') {
    status = 409; message = 'The system is busy. Please try again.';
  }

  if (status === 500) {
    // Log full detail on the server only; never send stack traces to the client in production.
    if (!env.isTest) console.error(err);
    if (!env.isProd) details = { debug: err.message };
  }
  res.status(status).json({ success: false, error: { message, ...(details ? { details } : {}) } });
}

module.exports = { notFound, errorHandler };
