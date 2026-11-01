const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, pool, ADMIN, resetAndLogin } = require('./helpers');

before(resetAndLogin);
after(() => pool.end());

test('valid login returns a token and no password hash', async () => {
  const r = await api.post('/api/v1/auth/login').send(ADMIN);
  assert.equal(r.status, 200);
  assert.ok(r.body.data.token);
  assert.equal(JSON.stringify(r.body).includes('password_hash'), false);
});
test('wrong password -> 401 with generic message', async () => {
  const r = await api.post('/api/v1/auth/login').send({ email: ADMIN.email, password: 'nope1234' });
  assert.equal(r.status, 401);
});
test('unknown email -> same 401 (no user enumeration)', async () => {
  const r = await api.post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'whatever1' });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.message, 'Incorrect email or password.');
});
test('invalid email format -> 400', async () => {
  const r = await api.post('/api/v1/auth/login').send({ email: 'not-an-email', password: 'x' });
  assert.equal(r.status, 400);
});
test('protected endpoints reject missing / garbage tokens with 401', async () => {
  assert.equal((await api.get('/api/v1/products')).status, 401);
  assert.equal((await api.get('/api/v1/analytics/dashboard').set('Authorization', 'Bearer abc.def.ghi')).status, 401);
});
test('registration is closed once an admin exists', async () => {
  const r = await api.post('/api/v1/auth/register').send({ name: 'Eve', email: 'eve@example.com', password: 'Passw0rd1' });
  assert.equal(r.status, 403);
});
test('passwords are stored as bcrypt hashes', async () => {
  const [[u]] = await pool.query('SELECT password_hash FROM users LIMIT 1');
  assert.match(u.password_hash, /^\$2[aby]\$/);
});
test('unknown route -> 404 JSON; malformed JSON -> 400', async () => {
  assert.equal((await api.get('/api/v1/nope')).status, 401); // auth runs first
  const t = (await api.post('/api/v1/auth/login').send(ADMIN)).body.data.token;
  assert.equal((await api.get('/api/v1/nope').set('Authorization', `Bearer ${t}`)).status, 404);
  const bad = await api.post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad json');
  assert.equal(bad.status, 400);
});
