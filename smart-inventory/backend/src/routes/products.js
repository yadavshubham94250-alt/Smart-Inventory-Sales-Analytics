const router = require('express').Router();
const pool = require('../config/db');
const v = require('../utils/validate');
const { AppError } = require('../utils/errors');
const { ok } = require('../utils/respond');

// Stock status rule (used everywhere):  out = 0 | low = 1..threshold | in_stock = above threshold
const STATUS_SQL = `CASE WHEN p.stock_qty = 0 THEN 'out_of_stock'
                         WHEN p.stock_qty <= p.low_stock_threshold THEN 'low_stock'
                         ELSE 'in_stock' END`;
const SELECT = `SELECT p.id, p.sku, p.name, p.category_id, c.name AS category, p.description,
                       p.cost_price, p.selling_price, p.stock_qty, p.low_stock_threshold, p.is_active,
                       ${STATUS_SQL} AS stock_status, p.created_at, p.updated_at
                  FROM products p JOIN categories c ON c.id = p.category_id`;

// Validates the editable product fields (stock is NOT editable here - see inventory adjustments).
async function parseBody(b) {
  const sku = v.str(b.sku, 'sku', { max: 40 }).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(sku)) throw new AppError(400, 'sku may only contain letters, numbers, - and _', { sku: 'Use letters, numbers, - and _ only' });
  const f = {
    sku,
    name: v.str(b.name, 'name', { min: 2, max: 150 }),
    category_id: v.id(b.category_id, 'category_id'),
    description: v.str(b.description, 'description', { max: 500, required: false }),
    cost_price: v.money(b.cost_price, 'cost_price'),
    selling_price: v.money(b.selling_price, 'selling_price'),
    low_stock_threshold: v.int(b.low_stock_threshold ?? 10, 'low_stock_threshold', { min: 0, max: 1000000 }),
  };
  const [c] = await pool.query('SELECT id FROM categories WHERE id = ?', [f.category_id]);
  if (!c[0]) throw new AppError(400, 'Selected category does not exist', { category_id: 'Category does not exist' });
  return f;
}

// GET /products?search=&category_id=&status=&active=&sort=&order=&page=&limit=
router.get('/', async (req, res) => {
  const q = req.query;
  const { page, limit, offset } = v.pagination(q);
  const where = [];
  const params = [];

  const active = v.oneOf(q.active, 'active', ['1', '0', 'all']) || '1';
  if (active !== 'all') { where.push('p.is_active = ?'); params.push(Number(active)); }
  if (q.search) {
    const s = v.str(q.search, 'search', { max: 100 });
    where.push('(p.name LIKE ? OR p.sku LIKE ?)');
    params.push(`%${s}%`, `%${s}%`);
  }
  if (q.category_id) { where.push('p.category_id = ?'); params.push(v.id(q.category_id, 'category_id')); }
  const status = v.oneOf(q.status, 'status', ['in_stock', 'low_stock', 'out_of_stock']);
  if (status) { where.push(`${STATUS_SQL} = ?`); params.push(status); }

  // Sorting uses a whitelist, so user input never reaches the SQL text.
  const sortCols = { name: 'p.name', price: 'p.selling_price', stock: 'p.stock_qty', created: 'p.created_at' };
  const sortKey = v.oneOf(q.sort, 'sort', Object.keys(sortCols)) || 'name';
  const order = v.oneOf(q.order, 'order', ['asc', 'desc']) === 'desc' ? 'DESC' : 'ASC';

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`, params);
  const [rows] = await pool.query(`${SELECT} ${whereSql} ORDER BY ${sortCols[sortKey]} ${order}, p.id LIMIT ? OFFSET ?`, [...params, limit, offset]);
  ok(res, rows, 200, { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/:id', async (req, res) => {
  const [rows] = await pool.query(`${SELECT} WHERE p.id = ?`, [v.id(req.params.id)]);
  if (!rows[0]) throw new AppError(404, 'Product not found');
  ok(res, rows[0]);
});

// POST /products - creates the product and (if opening stock > 0) logs an INITIAL movement.
router.post('/', async (req, res) => {
  const f = await parseBody(req.body);
  const stock = v.int(req.body.stock_qty ?? 0, 'stock_qty', { min: 0, max: 10000000 });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [dup] = await conn.query('SELECT id FROM products WHERE sku = ?', [f.sku]);
    if (dup[0]) throw new AppError(409, `SKU ${f.sku} already exists`, { sku: 'This SKU is already used' });
    const [r] = await conn.query(
      `INSERT INTO products (sku, name, category_id, description, cost_price, selling_price, stock_qty, low_stock_threshold)
       VALUES (?,?,?,?,?,?,?,?)`,
      [f.sku, f.name, f.category_id, f.description, f.cost_price, f.selling_price, stock, f.low_stock_threshold]);
    if (stock > 0) {
      await conn.query(
        `INSERT INTO inventory_movements (product_id, movement_type, quantity_before, quantity_change, quantity_after, reason, created_by)
         VALUES (?,?,?,?,?,?,?)`, [r.insertId, 'INITIAL', 0, stock, stock, 'Opening stock', req.user.id]);
    }
    await conn.commit();
    const [rows] = await pool.query(`${SELECT} WHERE p.id = ?`, [r.insertId]);
    ok(res, rows[0], 201);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

// PUT /products/:id - edits details only. Stock changes must go through /inventory/adjust.
router.put('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const f = await parseBody(req.body);
  const [dup] = await pool.query('SELECT id FROM products WHERE sku = ? AND id <> ?', [f.sku, id]);
  if (dup[0]) throw new AppError(409, `SKU ${f.sku} already exists`, { sku: 'This SKU is already used' });
  const [r] = await pool.query(
    `UPDATE products SET sku=?, name=?, category_id=?, description=?, cost_price=?, selling_price=?, low_stock_threshold=? WHERE id=?`,
    [f.sku, f.name, f.category_id, f.description, f.cost_price, f.selling_price, f.low_stock_threshold, id]);
  if (!r.affectedRows) throw new AppError(404, 'Product not found');
  const [rows] = await pool.query(`${SELECT} WHERE p.id = ?`, [id]);
  ok(res, rows[0]);
});

// DELETE /products/:id - SAFE DELETE POLICY: products are archived, never physically deleted,
// so sales history and stock movements always keep a valid reference.
router.delete('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const [r] = await pool.query('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
  if (!r.affectedRows) throw new AppError(404, 'Product not found');
  ok(res, { id, archived: true });
});

router.patch('/:id/restore', async (req, res) => {
  const id = v.id(req.params.id);
  const [r] = await pool.query('UPDATE products SET is_active = 1 WHERE id = ?', [id]);
  if (!r.affectedRows) throw new AppError(404, 'Product not found');
  ok(res, { id, archived: false });
});

module.exports = router;
