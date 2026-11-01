const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const env = require('../config/env');
const v = require('../utils/validate');
const { AppError } = require('../utils/errors');
const { ok } = require('../utils/respond');
const { requireAuth } = require('../middleware/auth');

const sign = (u) => jwt.sign({ email: u.email, role: u.role }, env.jwtSecret, { subject: String(u.id), expiresIn: env.jwtExpiresIn, algorithm: 'HS256' });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// A real bcrypt hash compared when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// POST /auth/register - bootstrap only: allowed while the users table is empty.
// After the first admin exists, further registrations are refused (403).
router.post('/register', async (req, res) => {
  const name = v.str(req.body.name, 'name', { min: 2, max: 100 });
  const email = v.email(req.body.email);
  const password = v.password(req.body.password);
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM users');
  if (n > 0) throw new AppError(403, 'Registration is closed. An admin already exists.');
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query('INSERT INTO users (name, email, password_hash) VALUES (?,?,?)', [name, email, hash]);
  const user = { id: r.insertId, name, email, role: 'admin' };
  ok(res, { token: sign(user), user: publicUser(user) }, 201);
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const email = v.email(req.body.email);
  if (typeof req.body.password !== 'string' || !req.body.password) throw new AppError(400, 'password is required', { password: 'password is required' });
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  const match = await bcrypt.compare(req.body.password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !match) throw new AppError(401, 'Incorrect email or password.');
  ok(res, { token: sign(user), user: publicUser(user) });
});

// GET /auth/me - lets the frontend check that a stored token is still valid.
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ?', [req.user.id]);
  if (!rows[0]) throw new AppError(401, 'Account no longer exists.');
  ok(res, { user: rows[0] });
});

// Logout is client-side with JWTs (the client discards the token); this endpoint exists for a clean API.
router.post('/logout', requireAuth, (_req, res) => ok(res, { message: 'Logged out. Discard the token on the client.' }));

module.exports = router;
