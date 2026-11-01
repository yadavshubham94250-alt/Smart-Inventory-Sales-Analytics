// Verifies "Authorization: Bearer <jwt>" and attaches req.user = { id, email, role }.
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AppError } = require('../utils/errors');

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError(401, 'Authentication required. Please log in.');
  try {
    const p = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: p.sub, email: p.email, role: p.role };
    next();
  } catch (e) {
    throw new AppError(401, e.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid token. Please log in again.');
  }
}

function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') throw new AppError(403, 'You do not have permission to do this.');
  next();
}

module.exports = { requireAuth, requireAdmin };
