// Generates SIAS.postman_collection.json. Run: node build_collection.cjs
const fs = require('fs');
const J = { 'Content-Type': 'application/json' };
const test = (lines) => ({ listen: 'test', script: { type: 'text/javascript', exec: lines } });
const req = (name, method, path, { body, auth = true, tests = [], pre } = {}) => ({
  name, event: [test(tests), ...(pre ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } }] : [])],
  request: { method, header: [...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []), ...(auth ? [] : [{ key: 'Authorization', value: '', disabled: true }])],
    auth: auth ? { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] } : { type: 'noauth' },
    url: '{{baseUrl}}' + path, ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {}) } });
const status = (n) => `pm.test('status is ${n}', () => pm.response.to.have.status(${n}));`;
const ok = "pm.test('success envelope', () => pm.expect(pm.response.json().success).to.eql(true));";

const items = [
  { name: '1. Authentication', item: [
    req('Login - valid', 'POST', '/auth/login', { auth: false, body: { email: '{{adminEmail}}', password: '{{adminPassword}}' },
      tests: [status(200), ok, "const j = pm.response.json(); pm.expect(j.data.token).to.be.a('string'); pm.collectionVariables.set('token', j.data.token);", "pm.test('no password hash leaked', () => pm.expect(pm.response.text()).to.not.include('password_hash'));"] }),
    req('Login - wrong password', 'POST', '/auth/login', { auth: false, body: { email: '{{adminEmail}}', password: 'WrongPass1' }, tests: [status(401)] }),
    req('Login - invalid email format', 'POST', '/auth/login', { auth: false, body: { email: 'nope', password: 'x' }, tests: [status(400)] }),
    req('Current user (GET /auth/me)', 'GET', '/auth/me', { tests: [status(200), "pm.test('returns user', () => pm.expect(pm.response.json().data.user.email).to.eql(pm.collectionVariables.get('adminEmail')));"] }),
    req('Protected route WITHOUT token', 'GET', '/products', { auth: false, tests: [status(401)] }),
  ] },
  { name: '2. Products', item: [
    req('List categories', 'GET', '/categories', { tests: [status(200), "pm.collectionVariables.set('categoryId', pm.response.json().data[0].id);"] }),
    req('Create product', 'POST', '/products', { pre: ["pm.collectionVariables.set('sku', 'PM-' + Date.now().toString().slice(-8));"],
      body: { sku: '{{sku}}', name: 'Postman Test Item', category_id: '{{categoryId}}', cost_price: 40, selling_price: 55.5, stock_qty: 10, low_stock_threshold: 3 },
      tests: [status(201), "const p = pm.response.json().data; pm.collectionVariables.set('productId', p.id); pm.expect(p.stock_qty).to.eql(10);"] }),
    req('Create product - duplicate SKU', 'POST', '/products', { body: { sku: '{{sku}}', name: 'Dup', category_id: '{{categoryId}}', cost_price: 1, selling_price: 2, stock_qty: 1 }, tests: [status(409)] }),
    req('Create product - negative price', 'POST', '/products', { body: { sku: 'NEG-1', name: 'Neg', category_id: '{{categoryId}}', cost_price: 1, selling_price: -2, stock_qty: 1 }, tests: [status(400)] }),
    req('Create product - negative stock', 'POST', '/products', { body: { sku: 'NEG-2', name: 'Neg', category_id: '{{categoryId}}', cost_price: 1, selling_price: 2, stock_qty: -4 }, tests: [status(400)] }),
    req('Search / filter / sort / paginate', 'GET', '/products?search=Postman&status=in_stock&sort=price&order=desc&page=1&limit=5', { tests: [status(200), "pm.test('has pagination meta', () => pm.expect(pm.response.json().meta).to.have.keys(['page','limit','total','totalPages']));"] }),
    req('Sort with injection attempt', 'GET', '/products?sort=name;DROP TABLE products', { tests: [status(400)] }),
    req('Update product', 'PUT', '/products/{{productId}}', { body: { sku: '{{sku}}', name: 'Postman Test Item v2', category_id: '{{categoryId}}', cost_price: 40, selling_price: 60, low_stock_threshold: 3 }, tests: [status(200), "pm.expect(pm.response.json().data.selling_price).to.eql(60);"] }),
  ] },
  { name: '3. Inventory', item: [
    req('Restock +20', 'POST', '/inventory/adjust', { body: { product_id: '{{productId}}', movement_type: 'RESTOCK', quantity_change: 20, reason: 'Postman restock' }, tests: [status(201), "const d = pm.response.json().data; pm.expect(d.quantity_before).to.eql(10); pm.expect(d.quantity_after).to.eql(30);"] }),
    req('Adjust below zero (rejected)', 'POST', '/inventory/adjust', { body: { product_id: '{{productId}}', movement_type: 'ADJUSTMENT', quantity_change: -999, reason: 'Too many' }, tests: [status(409)] }),
    req('Adjust without reason (rejected)', 'POST', '/inventory/adjust', { body: { product_id: '{{productId}}', movement_type: 'ADJUSTMENT', quantity_change: -1 }, tests: [status(400)] }),
    req('Movement history', 'GET', '/inventory/movements?product_id={{productId}}', { tests: [status(200), "pm.expect(pm.response.json().data.length).to.be.at.least(2);"] }),
    req('Alerts', 'GET', '/inventory/alerts', { tests: [status(200), "pm.expect(pm.response.json().data).to.have.keys(['low_stock','out_of_stock']);"] }),
  ] },
  { name: '4. Sales', item: [
    req('Create sale (qty 4 @ 60)', 'POST', '/sales', { pre: ["pm.collectionVariables.set('idemKey', 'pm-' + Date.now());"],
      body: { customer_name: 'Postman Customer', idempotency_key: '{{idemKey}}', items: [{ product_id: '{{productId}}', quantity: 4 }] },
      tests: [status(201), "const s = pm.response.json().data; pm.collectionVariables.set('saleId', s.id); pm.expect(s.total_amount).to.eql(240); pm.expect(s.status).to.eql('COMPLETED');"] }),
    req('Repeat same idempotency_key (no duplicate)', 'POST', '/sales', { body: { idempotency_key: '{{idemKey}}', items: [{ product_id: '{{productId}}', quantity: 4 }] }, tests: [status(200), "pm.expect(pm.response.json().data.id).to.eql(parseInt(pm.collectionVariables.get('saleId')));"] }),
    req('Fake price ignored by server', 'POST', '/sales', { body: { total_amount: 1, items: [{ product_id: '{{productId}}', quantity: 1, unit_price: 1 }] }, tests: [status(201), "pm.expect(pm.response.json().data.total_amount).to.eql(60);", "pm.collectionVariables.set('saleId2', pm.response.json().data.id);"] }),
    req('Insufficient stock', 'POST', '/sales', { body: { items: [{ product_id: '{{productId}}', quantity: 99999 }] }, tests: [status(409), "pm.expect(pm.response.json().error.message).to.include('Insufficient stock');"] }),
    req('Invalid quantity', 'POST', '/sales', { body: { items: [{ product_id: '{{productId}}', quantity: 0 }] }, tests: [status(400)] }),
    req('Sale details', 'GET', '/sales/{{saleId}}', { tests: [status(200), "pm.expect(pm.response.json().data.items[0].unit_cost).to.eql(40);"] }),
    req('Sales history with filters', 'GET', '/sales?status=COMPLETED&search=Postman&limit=5', { tests: [status(200)] }),
    req('Cancel sale without reason', 'POST', '/sales/{{saleId2}}/cancel', { body: {}, tests: [status(400)] }),
    req('Cancel sale', 'POST', '/sales/{{saleId2}}/cancel', { body: { reason: 'Postman cancel test' }, tests: [status(200), "pm.expect(pm.response.json().data.status).to.eql('CANCELLED');"] }),
    req('Cancel again (rejected)', 'POST', '/sales/{{saleId2}}/cancel', { body: { reason: 'second try' }, tests: [status(409)] }),
    req('Unknown sale', 'GET', '/sales/99999999', { tests: [status(404)] }),
  ] },
  { name: '5. Analytics & Reports', item: [
    req('Dashboard (default last 30 days)', 'GET', '/analytics/dashboard', { tests: [status(200), "const k = pm.response.json().data.kpis; ['revenue','gross_profit','gross_margin_pct','avg_order_value','total_products','stock_value','low_stock_count'].forEach(x => pm.expect(k).to.have.property(x));"] }),
    req('Dashboard - invalid date', 'GET', '/analytics/dashboard?from=2026-13-45', { tests: [status(400)] }),
    req('Dashboard - empty past range returns zeros', 'GET', '/analytics/dashboard?from=2000-01-01&to=2000-01-31', { tests: [status(200), "pm.expect(pm.response.json().data.kpis.revenue).to.eql(0);"] }),
    req('Sales trend (monthly)', 'GET', '/analytics/sales-trend?granularity=monthly&from=2026-01-01&to=2026-12-31', { tests: [status(200)] }),
    req('Compare periods', 'GET', '/analytics/compare?from_a=2026-10-01&to_a=2026-10-31&from_b=2026-09-01&to_b=2026-09-30', { tests: [status(200), "pm.expect(pm.response.json().data).to.have.keys(['period_a','period_b','change_pct_a_vs_b']);"] }),
    req('Top products by units', 'GET', '/analytics/products?sort=units&limit=5&only_sold=1', { tests: [status(200)] }),
    req('Slow-moving (60 days)', 'GET', '/analytics/slow-moving?days=60', { tests: [status(200)] }),
    req('CSV - sales report', 'GET', '/reports/sales?format=csv&from=2026-01-01&to=2026-12-31', { tests: [status(200), "pm.test('is CSV', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('text/csv'));", "pm.test('has header row', () => pm.expect(pm.response.text()).to.include('Invoice No'));"] }),
    req('CSV - inventory valuation', 'GET', '/reports/inventory-valuation?format=csv', { tests: [status(200), "pm.expect(pm.response.text()).to.include('Stock Value at Cost (INR)');"] }),
    req('CSV - low-stock', 'GET', '/reports/low-stock?format=csv', { tests: [status(200)] }),
  ] },
  { name: '6. Cleanup', item: [ req('Archive test product (soft delete)', 'DELETE', '/products/{{productId}}', { tests: [status(200), "pm.expect(pm.response.json().data.archived).to.eql(true);"] }) ] },
];
const collection = { info: { name: 'Smart Inventory & Sales Analytics API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  variable: [ { key: 'baseUrl', value: 'http://localhost:5000/api/v1' }, { key: 'adminEmail', value: 'admin@example.com' }, { key: 'adminPassword', value: 'Admin1234' }, { key: 'token', value: '' } ], item: items };
fs.writeFileSync(__dirname + '/SIAS.postman_collection.json', JSON.stringify(collection, null, 2));
console.log('requests:', items.reduce((a, g) => a + g.item.length, 0));
