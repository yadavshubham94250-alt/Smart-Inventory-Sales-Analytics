// Hand-calculated dataset (all values can be verified with a calculator):
//   A: cost 60, price 100      B: cost 20, price 50
//   Sale1: 2xA + 1xB -> revenue 250, COGS 140, profit 110
//   Sale2: 1xA       -> revenue 100, COGS  60, profit  40
//   Sale3: 4xB       -> revenue 200, COGS  80, profit 120
//   Totals: revenue 550, COGS 280, profit 270, margin 270/550 = 49.09%, orders 3, AOV 550/3 = 183.33, units 8
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, pool, resetAndLogin, auth, makeCategory, makeProduct, sell } = require('./helpers');

let token, A, B, s1, s2, s3;
const get = async (url) => (await api.get(`/api/v1${url}`).set(auth(token)));
before(async () => {
  token = await resetAndLogin();
  const c = await makeCategory(token, 'Cat One');
  A = await makeProduct(token, c, { sku: 'A', name: 'Product A', cost_price: 60, selling_price: 100, stock_qty: 100 });
  B = await makeProduct(token, c, { sku: 'B', name: 'Product B', cost_price: 20, selling_price: 50, stock_qty: 100 });
  s1 = (await sell(token, [{ product_id: A.id, quantity: 2 }, { product_id: B.id, quantity: 1 }])).body.data;
  s2 = (await sell(token, [{ product_id: A.id, quantity: 1 }])).body.data;
  s3 = (await sell(token, [{ product_id: B.id, quantity: 4 }])).body.data;
});
after(() => pool.end());

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

test('KPIs match the hand-calculated values', async () => {
  const k = (await get(`/analytics/dashboard?from=${today()}&to=${today()}`)).body.data.kpis;
  assert.equal(k.revenue, 550);
  assert.equal(k.cogs, 280);
  assert.equal(k.gross_profit, 270);
  assert.equal(k.gross_margin_pct, 49.09);
  assert.equal(k.orders, 3);
  assert.equal(k.avg_order_value, 183.33);
  assert.equal(k.units, 8);
  assert.equal(k.total_products, 2);
  assert.equal(k.total_units, 100 - 3 + 100 - 5);   // 192
  assert.equal(k.stock_value, 97 * 60 + 95 * 20);   // 7720
});
test('empty date range returns zeros, not errors or NaN (zero denominators)', async () => {
  const k = (await get('/analytics/dashboard?from=2000-01-01&to=2000-01-31')).body.data.kpis;
  assert.deepEqual([k.revenue, k.gross_profit, k.gross_margin_pct, k.orders, k.avg_order_value], [0, 0, 0, 0, 0]);
});
test('top products ranking and shares', async () => {
  const rows = (await get(`/analytics/products?from=${today()}&to=${today()}&sort=revenue`)).body.data;
  assert.deepEqual(rows.map((r) => [r.sku, r.revenue, r.units_sold, r.gross_profit]), [['A', 300, 3, 120], ['B', 250, 5, 150]]);
  assert.equal(rows[0].revenue_share_pct, 54.55);
  const byUnits = (await get(`/analytics/products?from=${today()}&to=${today()}&sort=units`)).body.data;
  assert.equal(byUnits[0].sku, 'B');
});
test('category performance', async () => {
  const [c] = (await get(`/analytics/categories?from=${today()}&to=${today()}`)).body.data;
  assert.deepEqual([c.category, c.revenue, c.gross_profit], ['Cat One', 550, 270]);
});
test('cost change affects only FUTURE sales (captured unit cost)', async () => {
  const put = await api.put(`/api/v1/products/${A.id}`).set(auth(token)).send({ sku: 'A', name: 'Product A', category_id: A.category_id, cost_price: 80, selling_price: 100, low_stock_threshold: 10 });
  assert.equal(put.status, 200);
  const s4 = (await sell(token, [{ product_id: A.id, quantity: 1 }])).body.data;
  assert.equal(s4.items[0].unit_cost, 80);
  const report = (await get(`/reports/sales?from=${today()}&to=${today()}`)).body.data;
  const bySale = Object.fromEntries(report.map((r) => [r.invoice_no, r.gross_profit]));
  assert.equal(bySale[s1.invoice_no], 110);   // old sales unchanged
  assert.equal(bySale[s4.invoice_no], 20);    // 100 - 80
});
test('cancelled sales are excluded from revenue, profit, orders and AOV; stock value reflects returned stock', async () => {
  const c = await api.post(`/api/v1/sales/${s3.id}/cancel`).set(auth(token)).send({ reason: 'Returned by customer' });
  assert.equal(c.status, 200);
  const k = (await get(`/analytics/dashboard?from=${today()}&to=${today()}`)).body.data.kpis;
  // Remaining: Sale1 (250/140) + Sale2 (100/60) + Sale4 (100/80)  => revenue 450, COGS 280, profit 170
  assert.deepEqual([k.revenue, k.cogs, k.gross_profit, k.orders, k.avg_order_value], [450, 280, 170, 3, 150]);
  assert.equal(k.stock_value, 96 * 80 + 99 * 20);   // A: 100-2-1-1=96 @80 ; B: 100-1-4+4=99 @20 => 9660
  const rep = (await get(`/reports/sales?from=${today()}&to=${today()}`)).body.data;
  assert.equal(rep.some((r) => r.status === 'CANCELLED'), false);
  const cancelled = (await get(`/reports/sales?from=${today()}&to=${today()}&status=CANCELLED`)).body.data;
  assert.equal(cancelled.length, 1);
});
test('period comparison with percentage change (and null when previous is zero)', async () => {
  const same = (await get(`/analytics/compare?from_a=${today()}&to_a=${today()}&from_b=2000-01-01&to_b=2000-01-31`)).body.data;
  assert.equal(same.period_a.revenue, 450);
  assert.equal(same.change_pct_a_vs_b.revenue, null);            // undefined change, not Infinity
  const vsSelf = (await get(`/analytics/compare?from_a=${today()}&to_a=${today()}&from_b=${today()}&to_b=${today()}`)).body.data;
  assert.equal(vsSelf.change_pct_a_vs_b.revenue, 0);
  assert.equal((await get('/analytics/compare?from_a=2026-01-01')).status, 400);
});
test('trend (daily/monthly) sums to the KPI revenue', async () => {
  const d = (await get(`/analytics/sales-trend?granularity=daily&from=${today()}&to=${today()}`)).body.data;
  assert.equal(d.length, 1);
  assert.equal(d[0].revenue, 450);
  const m = (await get(`/analytics/sales-trend?granularity=monthly&from=${today()}&to=${today()}`)).body.data;
  assert.equal(m[0].period, today().slice(0, 7));
  assert.equal((await get('/analytics/sales-trend?granularity=yearly')).status, 400);
});
test('slow-moving: product with stock and no recent sales is flagged', async () => {
  const c = A.category_id;
  const dead = await makeProduct(token, c, { sku: 'DEAD', name: 'Dead Stock', cost_price: 10, selling_price: 20, stock_qty: 50 });
  const rows = (await get('/analytics/slow-moving?days=30')).body.data;
  const hit = rows.find((r) => r.product_id === dead.id);
  assert.ok(hit);
  assert.equal(hit.stock_value, 500);
  assert.equal(rows.some((r) => r.sku === 'A'), false);   // A sold recently
});
test('CSV export: headers, filters respected, formula injection neutralised', async () => {
  await api.post('/api/v1/sales').set(auth(token)).send({ items: [{ product_id: B.id, quantity: 1 }], customer_name: '=HYPERLINK("http://evil")' });
  const res = await api.get(`/api/v1/reports/sales?format=csv&from=${today()}&to=${today()}`).set(auth(token));
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /sales_report_/);
  const lines = res.text.replace('\uFEFF', '').trim().split('\r\n');
  assert.equal(lines[0], 'Invoice No,Date & Time (IST),Customer,Status,Units,Revenue (INR),Cost of Goods Sold (INR),Gross Profit (INR)');
  assert.equal(lines.length - 1, 4);                       // 4 completed sales (s3 cancelled is excluded)
  assert.ok(res.text.includes(`"'=HYPERLINK(""http://evil"")"`));
  const empty = await api.get('/api/v1/reports/sales?format=csv&from=2000-01-01&to=2000-01-02').set(auth(token));
  assert.equal(empty.text.trim().split('\r\n').length, 1);  // header only
  const val = await api.get('/api/v1/reports/inventory-valuation?format=csv').set(auth(token));
  assert.match(val.text, /Stock Value at Cost \(INR\)/);
});
