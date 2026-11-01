const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, pool, resetAndLogin, auth, makeCategory, makeProduct, sell } = require('./helpers');

let token, cat;
before(async () => { token = await resetAndLogin(); cat = await makeCategory(token); });
after(() => pool.end());

const body = (o = {}) => ({ sku: 'P-1', name: 'Widget', category_id: cat, cost_price: 10, selling_price: 15, stock_qty: 5, low_stock_threshold: 2, ...o });

test('create product, with opening-stock movement', async () => {
  const r = await api.post('/api/v1/products').set(auth(token)).send(body());
  assert.equal(r.status, 201);
  assert.equal(r.body.data.stock_qty, 5);
  const [m] = (await pool.query('SELECT * FROM inventory_movements WHERE product_id=?', [r.body.data.id]))[0];
  assert.equal(m.movement_type, 'INITIAL');
  assert.equal(m.quantity_after, 5);
});
test('duplicate SKU (case-insensitive) -> 409', async () => {
  const r = await api.post('/api/v1/products').set(auth(token)).send(body({ sku: 'p-1' }));
  assert.equal(r.status, 409);
});
test('negative price / negative stock / bad decimals / missing name -> 400', async () => {
  for (const bad of [{ selling_price: -1 }, { cost_price: -5 }, { stock_qty: -3 }, { selling_price: 10.999 }, { name: '' }, { selling_price: 'abc' }, { category_id: 99999 }]) {
    const r = await api.post('/api/v1/products').set(auth(token)).send(body({ sku: `X-${Math.random().toString(36).slice(2, 7)}`, ...bad }));
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
});
test('edit changes details but NOT stock', async () => {
  const p = (await api.get('/api/v1/products?search=P-1').set(auth(token))).body.data[0];
  const r = await api.put(`/api/v1/products/${p.id}`).set(auth(token)).send(body({ name: 'Widget v2', selling_price: 20, stock_qty: 999 }));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.name, 'Widget v2');
  assert.equal(r.body.data.stock_qty, 5);
});
test('edit to another product\'s SKU -> 409', async () => {
  const other = await makeProduct(token, cat, { sku: 'P-2' });
  const r = await api.put(`/api/v1/products/${other.id}`).set(auth(token)).send(body({ sku: 'P-1' }));
  assert.equal(r.status, 409);
});
test('delete archives (never removes) a product that has sales; sales history stays intact', async () => {
  const p = await makeProduct(token, cat, { sku: 'P-3', stock_qty: 10 });
  const s = await sell(token, [{ product_id: p.id, quantity: 2 }]);
  assert.equal(s.status, 201);
  const d = await api.delete(`/api/v1/products/${p.id}`).set(auth(token));
  assert.equal(d.status, 200);
  assert.equal(d.body.data.archived, true);
  assert.equal((await api.get('/api/v1/products').set(auth(token))).body.data.some((x) => x.id === p.id), false);
  assert.equal((await api.get('/api/v1/products?active=0').set(auth(token))).body.data.some((x) => x.id === p.id), true);
  const sale = await api.get(`/api/v1/sales/${s.body.data.id}`).set(auth(token));
  assert.equal(sale.body.data.items[0].product_name, 'Test Product');
  // an archived product cannot be sold
  assert.equal((await sell(token, [{ product_id: p.id, quantity: 1 }])).status, 409);
});
test('search, status filter, sort and pagination', async () => {
  await makeProduct(token, cat, { sku: 'Z-LOW', name: 'Zed Low', stock_qty: 1, low_stock_threshold: 5 });
  await makeProduct(token, cat, { sku: 'Z-OUT', name: 'Zed Out', stock_qty: 0 });
  const low = (await api.get('/api/v1/products?status=low_stock').set(auth(token))).body.data;
  assert.ok(low.every((p) => p.stock_status === 'low_stock') && low.some((p) => p.sku === 'Z-LOW'));
  const out = (await api.get('/api/v1/products?status=out_of_stock').set(auth(token))).body.data;
  assert.ok(out.some((p) => p.sku === 'Z-OUT'));
  const page = await api.get('/api/v1/products?sort=price&order=desc&limit=2&page=1').set(auth(token));
  assert.equal(page.body.data.length, 2);
  assert.ok(page.body.data[0].selling_price >= page.body.data[1].selling_price);
  assert.ok(page.body.meta.total >= 4);
  assert.equal((await api.get('/api/v1/products?sort=; DROP TABLE products').set(auth(token))).status, 400); // sort whitelist
  assert.equal((await api.get("/api/v1/products?search=' OR 1=1 --").set(auth(token))).status, 200);          // parameterised: harmless
});
