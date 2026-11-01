const router = require('express').Router();
const pool = require('../config/db');
const v = require('../utils/validate');
const { AppError } = require('../utils/errors');
const { ok } = require('../utils/respond');

// POST /inventory/adjust
//   RESTOCK    : quantity_change must be > 0 (goods received)
//   ADJUSTMENT : any non-zero signed change (damage, recount, loss...)
// The product row is locked (FOR UPDATE) so concurrent changes cannot overwrite each other.
router.post('/adjust', async (req, res) => {
  const productId = v.id(req.body.product_id, 'product_id');
  const type = v.oneOf(req.body.movement_type, 'movement_type', ['RESTOCK', 'ADJUSTMENT'], { required: true });
  const change = v.int(req.body.quantity_change, 'quantity_change', { min: -10000000, max: 10000000 });
  const reason = v.str(req.body.reason, 'reason', { min: 3, max: 255 });
  if (change === 0) throw new AppError(400, 'quantity_change cannot be zero', { quantity_change: 'Enter a non-zero quantity' });
  if (type === 'RESTOCK' && change < 0) throw new AppError(400, 'A restock must add stock. Use ADJUSTMENT to remove stock.', { quantity_change: 'Must be positive for a restock' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, stock_qty FROM products WHERE id = ? FOR UPDATE', [productId]);
    if (!rows[0]) throw new AppError(404, 'Product not found');
    const before = rows[0].stock_qty;
    const after = before + change;
    if (after < 0) throw new AppError(409, `Cannot remove ${-change} units. Only ${before} in stock.`, { quantity_change: `Only ${before} in stock` });
    await conn.query('UPDATE products SET stock_qty = ? WHERE id = ?', [after, productId]);
    const [m] = await conn.query(
      `INSERT INTO inventory_movements (product_id, movement_type, quantity_before, quantity_change, quantity_after, reason, created_by)
       VALUES (?,?,?,?,?,?,?)`, [productId, type, before, change, after, reason, req.user.id]);
    await conn.commit();
    ok(res, { movement_id: m.insertId, product_id: productId, quantity_before: before, quantity_change: change, quantity_after: after }, 201);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

// GET /inventory/movements?product_id=&type=&from=&to=&page=&limit=
router.get('/movements', async (req, res) => {
  const q = req.query;
  const { page, limit, offset } = v.pagination(q, { defaultLimit: 15 });
  const range = v.dateRange(q);
  const where = ['m.created_at >= ?', 'm.created_at < ?'];
  const params = [range.start, range.end];
  if (q.product_id) { where.push('m.product_id = ?'); params.push(v.id(q.product_id, 'product_id')); }
  const type = v.oneOf(q.type, 'type', ['INITIAL', 'RESTOCK', 'ADJUSTMENT', 'SALE', 'SALE_REVERSAL']);
  if (type) { where.push('m.movement_type = ?'); params.push(type); }
  const w = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM inventory_movements m ${w}`, params);
  const [rows] = await pool.query(
    `SELECT m.id, m.created_at, m.product_id, p.sku, p.name AS product_name, m.movement_type,
            m.quantity_before, m.quantity_change, m.quantity_after, m.reason, m.sale_id,
            s.invoice_no, u.name AS user_name
       FROM inventory_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN sales s ON s.id = m.sale_id
       LEFT JOIN users u ON u.id = m.created_by
       ${w} ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  ok(res, rows, 200, { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// GET /inventory/alerts - low-stock and out-of-stock lists for active products.
router.get('/alerts', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT p.id, p.sku, p.name, c.name AS category, p.stock_qty, p.low_stock_threshold,
            CASE WHEN p.stock_qty = 0 THEN 'out_of_stock' ELSE 'low_stock' END AS stock_status,
            GREATEST(p.low_stock_threshold * 2 - p.stock_qty, 0) AS suggested_restock_qty
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1 AND p.stock_qty <= p.low_stock_threshold
      ORDER BY p.stock_qty ASC, p.name`);
  ok(res, { low_stock: rows.filter((r) => r.stock_status === 'low_stock'), out_of_stock: rows.filter((r) => r.stock_status === 'out_of_stock') });
});

module.exports = router;
