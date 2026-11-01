const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, pool, resetAndLogin, auth, makeCategory, makeProduct, sell, stockOf } = require('./helpers');

let token, cat;
before(async () => { token = await resetAndLogin(); cat = await makeCategory(token); });
after(() => pool.end());

test('successful sale: server totals, stock reduced, movement logged', async () => {
  const a = await makeProduct(token, cat, { sku: 'S-A', cost_price: 60, selling_price: 100, stock_qty: 10 });
  const b = await makeProduct(token, cat, { sku: 'S-B', cost_price: 20, selling_price: 49.99, stock_qty: 10 });
  const r = await sell(token, [{ product_id: a.id, quantity: 2 }, { product_id: b.id, quantity: 3 }], { customer_name: 'Asha' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.total_amount, 349.97);                       // 2*100 + 3*49.99
  assert.match(r.body.data.invoice_no, /^INV-\d{8}-\d{5}$/);
  assert.equal(await stockOf(a.id), 8);
  assert.equal(await stockOf(b.id), 7);
  const [mv] = await pool.query("SELECT * FROM inventory_movements WHERE sale_id=? AND movement_type='SALE' ORDER BY product_id", [r.body.data.id]);
  assert.deepEqual(mv.map((m) => [m.quantity_before, m.quantity_change, m.quantity_after]), [[10, -2, 8], [10, -3, 7]]);
  assert.equal(r.body.data.items[0].unit_cost, 60);                      // cost captured
});
test('frontend-supplied price/total is ignored', async () => {
  const p = await makeProduct(token, cat, { sku: 'S-C', selling_price: 100, stock_qty: 5 });
  const r = await sell(token, [{ product_id: p.id, quantity: 1, unit_price: 1, price: 1 }], { total_amount: 1 });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.total_amount, 100);
});
test('insufficient stock -> 409 and NOTHING changes (rollback)', async () => {
  const ok = await makeProduct(token, cat, { sku: 'S-D', stock_qty: 10 });
  const low = await makeProduct(token, cat, { sku: 'S-E', stock_qty: 1 });
  const [[before]] = await pool.query('SELECT (SELECT COUNT(*) FROM sales) AS s, (SELECT COUNT(*) FROM inventory_movements) AS m');
  const r = await sell(token, [{ product_id: ok.id, quantity: 4 }, { product_id: low.id, quantity: 2 }]);
  assert.equal(r.status, 409);
  assert.match(r.body.error.message, /Insufficient stock/);
  assert.equal(await stockOf(ok.id), 10);                                 // first line NOT applied
  assert.equal(await stockOf(low.id), 1);
  const [[after]] = await pool.query('SELECT (SELECT COUNT(*) FROM sales) AS s, (SELECT COUNT(*) FROM inventory_movements) AS m');
  assert.deepEqual(after, before);
});
test('invalid input: empty cart, zero/negative/fractional qty, unknown product -> 400/409', async () => {
  const p = await makeProduct(token, cat, { sku: 'S-F', stock_qty: 5 });
  assert.equal((await sell(token, [])).status, 400);
  assert.equal((await sell(token, [{ product_id: p.id, quantity: 0 }])).status, 400);
  assert.equal((await sell(token, [{ product_id: p.id, quantity: -2 }])).status, 400);
  assert.equal((await sell(token, [{ product_id: p.id, quantity: 1.5 }])).status, 400);
  assert.equal((await sell(token, [{ product_id: 999999, quantity: 1 }])).status, 409);
  assert.equal(await stockOf(p.id), 5);
});
test('same product on two lines is merged and still stock-checked', async () => {
  const p = await makeProduct(token, cat, { sku: 'S-G', stock_qty: 5 });
  assert.equal((await sell(token, [{ product_id: p.id, quantity: 3 }, { product_id: p.id, quantity: 3 }])).status, 409);
  const ok = await sell(token, [{ product_id: p.id, quantity: 2 }, { product_id: p.id, quantity: 2 }]);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.items.length, 1);
  assert.equal(ok.body.data.items[0].quantity, 4);
});
test('duplicate submission with same idempotency_key creates ONE sale', async () => {
  const p = await makeProduct(token, cat, { sku: 'S-H', stock_qty: 10 });
  const key = 'key-12345';
  const [r1, r2] = await Promise.all([sell(token, [{ product_id: p.id, quantity: 1 }], { idempotency_key: key }), sell(token, [{ product_id: p.id, quantity: 1 }], { idempotency_key: key })]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 201]);
  assert.equal(r1.body.data.id, r2.body.data.id);
  assert.equal(await stockOf(p.id), 9);
});
test('CONCURRENCY: 10 simultaneous 1-unit sales against 4 units of stock -> exactly 4 succeed, stock ends at 0', async () => {
  const p = await makeProduct(token, cat, { sku: 'S-RACE', stock_qty: 4 });
  const results = await Promise.all(Array.from({ length: 10 }, () => sell(token, [{ product_id: p.id, quantity: 1 }])));
  const okCount = results.filter((r) => r.status === 201).length;
  assert.equal(okCount, 4);
  const losers = results.filter((r) => r.status === 409);
  assert.equal(losers.length, 6);
  // With the row lock the losers are rejected cleanly for the RIGHT reason (not by deadlock/'system busy').
  assert.ok(losers.every((r) => /Insufficient stock/.test(r.body.error.message)), losers.map((r) => r.body.error.message).join(' | '));
  assert.equal(await stockOf(p.id), 0);
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM inventory_movements WHERE product_id=? AND movement_type='SALE'", [p.id]);
  assert.equal(n, 4);
});
test('cancel restores stock, logs reversal, and cannot be repeated', async () => {
  const p = await makeProduct(token, cat, { sku: 'S-CAN', stock_qty: 10 });
  const s = await sell(token, [{ product_id: p.id, quantity: 6 }]);
  assert.equal(await stockOf(p.id), 4);
  assert.equal((await api.post(`/api/v1/sales/${s.body.data.id}/cancel`).set(auth(token)).send({})).status, 400); // reason required
  const c = await api.post(`/api/v1/sales/${s.body.data.id}/cancel`).set(auth(token)).send({ reason: 'Customer changed mind' });
  assert.equal(c.status, 200);
  assert.equal(c.body.data.status, 'CANCELLED');
  assert.equal(await stockOf(p.id), 10);
  const [[mv]] = await pool.query("SELECT * FROM inventory_movements WHERE sale_id=? AND movement_type='SALE_REVERSAL'", [s.body.data.id]);
  assert.deepEqual([mv.quantity_before, mv.quantity_change, mv.quantity_after], [4, 6, 10]);
  assert.equal((await api.post(`/api/v1/sales/${s.body.data.id}/cancel`).set(auth(token)).send({ reason: 'again please' })).status, 409);
  assert.equal(await stockOf(p.id), 10);
  assert.equal((await api.post('/api/v1/sales/999999/cancel').set(auth(token)).send({ reason: 'no such sale' })).status, 404);
});
test('sales history: filter by status, search by invoice, details by id', async () => {
  const list = await api.get('/api/v1/sales?status=CANCELLED').set(auth(token));
  assert.ok(list.body.data.length >= 1 && list.body.data.every((s) => s.status === 'CANCELLED'));
  const inv = list.body.data[0].invoice_no;
  const found = await api.get(`/api/v1/sales?search=${inv}`).set(auth(token));
  assert.equal(found.body.data.length, 1);
  const none = await api.get('/api/v1/sales?from=2000-01-01&to=2000-01-31').set(auth(token));
  assert.equal(none.body.data.length, 0);
  assert.equal((await api.get('/api/v1/sales/999999').set(auth(token))).status, 404);
  assert.equal((await api.get('/api/v1/sales?from=2026-02-30').set(auth(token))).status, 400);
});
test('stock adjustments: restock/adjust are traceable; cannot go below zero', async () => {
  const p = await makeProduct(token, cat, { sku: 'S-ADJ', stock_qty: 5 });
  const post = (b) => api.post('/api/v1/inventory/adjust').set(auth(token)).send({ product_id: p.id, ...b });
  const r = await post({ movement_type: 'RESTOCK', quantity_change: 20, reason: 'Supplier delivery' });
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.data.quantity_before, r.body.data.quantity_after], [5, 25]);
  assert.equal((await post({ movement_type: 'ADJUSTMENT', quantity_change: -3, reason: 'Damaged in storage' })).status, 201);
  assert.equal(await stockOf(p.id), 22);
  assert.equal((await post({ movement_type: 'ADJUSTMENT', quantity_change: -23, reason: 'Recount' })).status, 409);
  assert.equal((await post({ movement_type: 'RESTOCK', quantity_change: -1, reason: 'wrong sign' })).status, 400);
  assert.equal((await post({ movement_type: 'RESTOCK', quantity_change: 5 })).status, 400);                       // reason required
  assert.equal((await post({ movement_type: 'ADJUSTMENT', quantity_change: 0, reason: 'nothing' })).status, 400);
  const mv = await api.get(`/api/v1/inventory/movements?product_id=${p.id}`).set(auth(token));
  assert.deepEqual(mv.body.data.map((m) => m.movement_type), ['ADJUSTMENT', 'RESTOCK', 'INITIAL']);
  assert.equal(mv.body.data[0].user_name, 'Tester');
});
