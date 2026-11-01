// Builds the Express app (kept separate from server.js so tests can import it without opening a port).
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { requireAuth } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);                        // correct client IP behind a hosting proxy
app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json({ limit: '100kb' }));

// Brute-force protection for login/register (disabled in automated tests).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, error: { message: 'Too many attempts. Please try again in 15 minutes.' } },
});

app.get('/api/v1/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
app.use('/api/v1/auth', authLimiter, require('./routes/auth'));

// Everything below needs a valid JWT.
const api = express.Router();
api.use(requireAuth);
api.use('/categories', require('./routes/categories'));
api.use('/products', require('./routes/products'));
api.use('/inventory', require('./routes/inventory'));
api.use('/sales', require('./routes/sales'));
api.use('/analytics', require('./routes/analytics'));
api.use('/reports', require('./routes/reports'));
app.use('/api/v1', api);

app.use(notFound);
app.use(errorHandler);
module.exports = app;
