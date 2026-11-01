const router = require('express').Router();
const pool = require('../config/db');
const v = require('../utils/validate');
const { ok } = require('../utils/respond');
const A = require('../services/analyticsService');

// If the client sends no dates, default to the last 30 days (today included), in IST.
async function rangeOrDefault(q) {
  const given = v.dateRange(q);
  if (given.from || given.to) return given;
  const [[d]] = await pool.query(`SELECT DATE_FORMAT(CURDATE() - INTERVAL 29 DAY, '%Y-%m-%d') AS f, DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS t`);
  return v.dateRange({ from: d.f, to: d.t });
}
const rangeMeta = (r) => ({ from: r.from, to: r.to });

// GET /analytics/dashboard?from=&to=
router.get('/dashboard', async (req, res) => {
  const range = await rangeOrDefault(req.query);
  const [kpis, inventory, monthly, topProducts, categories, recent, lowStock] = await Promise.all([
    A.salesKpis(range), A.inventorySnapshot(), A.monthlyTrendLast(6),
    A.productPerformance(range, { sort: 'revenue', limit: 5, onlySold: true }),
    A.categoryPerformance(range), A.recentSales(8), A.lowStockList(),
  ]);
  ok(res, { kpis: { ...kpis, ...inventory }, monthly_trend: monthly, top_products: topProducts,
            category_sales: categories.filter((c) => c.revenue > 0), recent_sales: recent, low_stock: lowStock.slice(0, 8) },
     200, { range: rangeMeta(range) });
});

// GET /analytics/sales-trend?granularity=daily|weekly|monthly&from=&to=
router.get('/sales-trend', async (req, res) => {
  const g = v.oneOf(req.query.granularity, 'granularity', ['daily', 'weekly', 'monthly']) || 'daily';
  const range = await rangeOrDefault(req.query);
  ok(res, await A.salesTrend(g, range), 200, { range: rangeMeta(range), granularity: g });
});

// GET /analytics/summary?from=&to=  (KPIs + best periods)
router.get('/summary', async (req, res) => {
  const range = await rangeOrDefault(req.query);
  const [kpis, best] = await Promise.all([A.salesKpis(range), A.bestPeriods(range)]);
  ok(res, { kpis, ...best }, 200, { range: rangeMeta(range) });
});

// GET /analytics/compare?from_a=&to_a=&from_b=&to_b=   (A is compared against B)
router.get('/compare', async (req, res) => {
  const a = v.dateRange(req.query, 'from_a', 'to_a');
  const b = v.dateRange(req.query, 'from_b', 'to_b');
  v.date(req.query.from_a, 'from_a', { required: true }); v.date(req.query.to_a, 'to_a', { required: true });
  v.date(req.query.from_b, 'from_b', { required: true }); v.date(req.query.to_b, 'to_b', { required: true });
  ok(res, await A.comparePeriods(a, b));
});

// GET /analytics/products?sort=revenue|units|profit&limit=&from=&to=
router.get('/products', async (req, res) => {
  const range = await rangeOrDefault(req.query);
  const sort = v.oneOf(req.query.sort, 'sort', ['revenue', 'units', 'profit']) || 'revenue';
  const limit = req.query.limit ? v.int(req.query.limit, 'limit', { min: 1, max: 100 }) : null;
  ok(res, await A.productPerformance(range, { sort, limit, onlySold: req.query.only_sold === '1' }), 200, { range: rangeMeta(range) });
});

router.get('/categories', async (req, res) => {
  const range = await rangeOrDefault(req.query);
  ok(res, await A.categoryPerformance(range), 200, { range: rangeMeta(range) });
});

// GET /analytics/slow-moving?days=30&max_units=0&min_stock=1
router.get('/slow-moving', async (req, res) => {
  const days = req.query.days ? v.int(req.query.days, 'days', { min: 1, max: 3650 }) : 30;
  const maxUnits = req.query.max_units ? v.int(req.query.max_units, 'max_units', { min: 0, max: 100000 }) : 0;
  const minStock = req.query.min_stock ? v.int(req.query.min_stock, 'min_stock', { min: 0, max: 10000000 }) : 1;
  ok(res, await A.slowMoving({ days, maxUnits, minStock }), 200, { days, max_units: maxUnits, min_stock: minStock });
});

router.get('/inventory', async (_req, res) => {
  const [snapshot, valuation] = await Promise.all([A.inventorySnapshot(), A.inventoryValuation()]);
  ok(res, { snapshot, valuation });
});

module.exports = router;
