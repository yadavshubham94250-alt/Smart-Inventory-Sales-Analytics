const router = require('express').Router();
const pool = require('../config/db');
const v = require('../utils/validate');
const { AppError } = require('../utils/errors');
const { ok } = require('../utils/respond');
const { createSale, cancelSale, getSaleById } = require('../services/salesService');

// POST /sales - 201 when created, 200 when an identical idempotency_key returns the earlier sale.
router.post('/', async (req, res) => {
  const { sale, duplicate } = await createSale(req.user.id, req.body);
  ok(res, sale, duplicate ? 200 : 201, duplicate ? { duplicate: true } : undefined);
});

// GET /sales?from=&to=&status=&search=&product_id=&page=&limit=
// search matches invoice number, numeric sale id or customer name.
router.get('/', async (req, res) => {
  const q = req.query;
  const { page, limit, offset } = v.pagination(q);
  const range = v.dateRange(q);
  const where = ['s.sold_at >= ?', 's.sold_at < ?'];
  const params = [range.start, range.end];
  const status = v.oneOf(q.status, 'status', ['COMPLETED', 'CANCELLED']);
  if (status) { where.push('s.status = ?'); params.push(status); }
  if (q.search) {
    const s = v.str(q.search, 'search', { max: 60 });
    where.push('(s.invoice_no LIKE ? OR s.customer_name LIKE ? OR s.id = ?)');
    params.push(`%${s}%`, `%${s}%`, /^\d+$/.test(s) ? Number(s) : 0);
  }
  if (q.product_id) {
    where.push('EXISTS (SELECT 1 FROM sale_items x WHERE x.sale_id = s.id AND x.product_id = ?)');
    params.push(v.id(q.product_id, 'product_id'));
  }
  const w = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM sales s ${w}`, params);
  const [rows] = await pool.query(
    `SELECT s.id, s.invoice_no, s.customer_name, s.total_amount, s.status, s.sold_at,
            (SELECT COALESCE(SUM(quantity),0) FROM sale_items WHERE sale_id = s.id) AS units,
            (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) AS line_count
       FROM sales s ${w} ORDER BY s.sold_at DESC, s.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  ok(res, rows, 200, { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/:id', async (req, res) => {
  const sale = await getSaleById(pool, v.id(req.params.id));
  if (!sale) throw new AppError(404, 'Sale not found');
  ok(res, sale);
});

// POST /sales/:id/cancel  { reason }
router.post('/:id/cancel', async (req, res) => {
  ok(res, await cancelSale(req.user.id, v.id(req.params.id), req.body.reason));
});

module.exports = router;
