// Shared test setup. Tests run against a SEPARATE database (sias_test), never your real data.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'sias_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_that_is_long_enough_123456';

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const pool = require('../src/config/db');
const { initDb } = require('../src/utils/initDb');

// One shared listening server (unref'd so the test process can exit) instead of one per request.
const api = request(app.listen(0).unref());
const ADMIN = { email: 'tester@example.com', password: 'Test1234' };

// Drops/recreates tables, inserts one admin and returns a valid JWT.
async function resetAndLogin() {
  await initDb({ reset: true });
  const hash = await bcrypt.hash(ADMIN.password, 4);
  await pool.query('INSERT INTO users (name, email, password_hash) VALUES (?,?,?)', ['Tester', ADMIN.email, hash]);
  const res = await api.post('/api/v1/auth/login').send(ADMIN);
  return res.body.data.token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function makeCategory(token, name = 'Test Cat') {
  const r = await api.post('/api/v1/categories').set(auth(token)).send({ name });
  return r.body.data.id;
}
async function makeProduct(token, categoryId, o = {}) {
  const r = await api.post('/api/v1/products').set(auth(token)).send({
    sku: o.sku || 'T-001', name: o.name || 'Test Product', category_id: categoryId,
    cost_price: o.cost_price ?? 60, selling_price: o.selling_price ?? 100, stock_qty: o.stock_qty ?? 100, low_stock_threshold: o.low_stock_threshold ?? 10,
  });
  if (r.status !== 201) throw new Error(`makeProduct failed: ${JSON.stringify(r.body)}`);
  return r.body.data;
}
const sell = (token, items, extra = {}) => api.post('/api/v1/sales').set(auth(token)).send({ items, ...extra });
const stockOf = async (id) => (await pool.query('SELECT stock_qty FROM products WHERE id=?', [id]))[0][0].stock_qty;

module.exports = { api, pool, ADMIN, resetAndLogin, auth, makeCategory, makeProduct, sell, stockOf };
