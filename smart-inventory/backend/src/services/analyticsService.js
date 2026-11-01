// All analytics queries live here, so the dashboard, the analytics page and the CSV reports
// share EXACTLY the same SQL and therefore always agree.
//
// "Eligible" sale = sales.status = 'COMPLETED'. Cancelled sales are excluded everywhere.
// Revenue = SUM(sale_items.line_total)            (quantity x actual selling price)
// COGS    = SUM(quantity x sale_items.unit_cost)  (cost captured at the time of sale)
// Gross profit = Revenue - COGS (NOT net profit: no expenses/taxes are modelled)
// Gross margin % = Gross profit / Revenue x 100  (0 when revenue = 0)
// AOV = Revenue / number of completed sales      (0 when no sales)
const pool = require('../config/db');

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const pct = (num, den) => (den > 0 ? r2((num / den) * 100) : 0);
// Percentage change between periods; null when the old value is 0 (change is undefined).
const change = (now, before) => (before > 0 ? r2(((now - before) / before) * 100) : null);

// Sub-select of eligible sale lines inside a date window - reused by several queries.
const ELIGIBLE_ITEMS = `
  SELECT si.product_id, si.sale_id, si.quantity, si.line_total, si.unit_cost, s.sold_at
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
   WHERE s.status = 'COMPLETED' AND s.sold_at >= ? AND s.sold_at < ?`;

function withDerived(row) {
  const revenue = r2(row.revenue), cogs = r2(row.cogs), gp = r2(revenue - cogs);
  return { ...row, revenue, cogs, gross_profit: gp, gross_margin_pct: pct(gp, revenue) };
}

// ---- 1. Sales performance ----
async function salesKpis({ start, end }) {
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT sale_id) AS orders, COALESCE(SUM(quantity),0) AS units,
            COALESCE(SUM(line_total),0) AS revenue, COALESCE(SUM(quantity * unit_cost),0) AS cogs
       FROM (${ELIGIBLE_ITEMS}) t`, [start, end]);
  const d = withDerived(row);
  return { ...d, orders: Number(row.orders), units: Number(row.units), avg_order_value: d.orders > 0 ? r2(d.revenue / d.orders) : 0 };
}

const PERIODS = {
  daily:   "DATE_FORMAT(sold_at, '%Y-%m-%d')",
  weekly:  "DATE_FORMAT(DATE_SUB(DATE(sold_at), INTERVAL WEEKDAY(sold_at) DAY), '%Y-%m-%d')", // Monday of that week
  monthly: "DATE_FORMAT(sold_at, '%Y-%m')",
};
async function salesTrend(granularity, { start, end }) {
  const expr = PERIODS[granularity];           // whitelisted, never user text
  const [rows] = await pool.query(
    `SELECT ${expr} AS period, COUNT(DISTINCT sale_id) AS orders, SUM(quantity) AS units,
            SUM(line_total) AS revenue, SUM(quantity * unit_cost) AS cogs
       FROM (${ELIGIBLE_ITEMS}) t GROUP BY period ORDER BY period`, [start, end]);
  return rows.map((r) => ({ ...withDerived(r), orders: Number(r.orders), units: Number(r.units) }));
}

// Last N calendar months incl. the current one, with zero-filled gaps (for charts).
async function monthlyTrendLast(n = 12) {
  const [[{ s }]] = await pool.query(`SELECT DATE_FORMAT(NOW() - INTERVAL ? MONTH, '%Y-%m-01 00:00:00') AS s`, [n - 1]);
  const rows = await salesTrend('monthly', { start: s, end: '9999-12-31 00:00:00' });
  const map = new Map(rows.map((r) => [r.period, r]));
  const out = [];
  let [y, m] = [Number(s.slice(0, 4)), Number(s.slice(5, 7))];
  for (let i = 0; i < n; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(map.get(key) || { period: key, orders: 0, units: 0, revenue: 0, cogs: 0, gross_profit: 0, gross_margin_pct: 0 });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

async function comparePeriods(a, b) {
  const [A, B] = await Promise.all([salesKpis(a), salesKpis(b)]);
  const keys = ['revenue', 'gross_profit', 'orders', 'units', 'avg_order_value'];
  const changes = Object.fromEntries(keys.map((k) => [k, change(A[k], B[k])]));
  changes.gross_margin_pct_points = r2(A.gross_margin_pct - B.gross_margin_pct); // margin change in percentage points
  return { period_a: A, period_b: B, change_pct_a_vs_b: changes };
}

// Best months / weekdays / single days by revenue inside the range.
async function bestPeriods({ start, end }) {
  const q = (expr, label) => pool.query(
    `SELECT ${expr} AS ${label}, SUM(line_total) AS revenue, COUNT(DISTINCT sale_id) AS orders
       FROM (${ELIGIBLE_ITEMS}) t GROUP BY ${label} ORDER BY revenue DESC LIMIT 3`, [start, end]);
  const [[months], [weekdays], [days]] = await Promise.all([
    q("DATE_FORMAT(sold_at, '%Y-%m')", 'month'),
    q('DAYNAME(sold_at)', 'weekday'),
    q("DATE_FORMAT(sold_at, '%Y-%m-%d')", 'day'),
  ]);
  const fix = (rows) => rows.map((r) => ({ ...r, revenue: r2(r.revenue), orders: Number(r.orders) }));
  return { best_months: fix(months), best_weekdays: fix(weekdays), best_days: fix(days) };
}

// ---- 2. Product performance (every active product appears, even with zero sales) ----
async function productPerformance({ start, end }, { sort = 'revenue', limit = null, onlySold = false, includeArchived = false } = {}) {
  const orderBy = { revenue: 'revenue DESC', units: 'units_sold DESC', profit: 'gross_profit DESC', name: 'p.name ASC' }[sort] || 'revenue DESC';
  const [rows] = await pool.query(
    `SELECT p.id AS product_id, p.sku, p.name, c.name AS category,
            COALESCE(SUM(t.quantity),0) AS units_sold,
            COALESCE(SUM(t.line_total),0) AS revenue,
            COALESCE(SUM(t.quantity * t.unit_cost),0) AS cogs,
            p.stock_qty
       FROM products p JOIN categories c ON c.id = p.category_id
       LEFT JOIN (${ELIGIBLE_ITEMS}) t ON t.product_id = p.id
      ${includeArchived ? '' : 'WHERE p.is_active = 1'}
      GROUP BY p.id, p.sku, p.name, c.name, p.stock_qty
      ${onlySold ? 'HAVING units_sold > 0' : ''}
      ORDER BY ${orderBy}, p.name ${limit ? 'LIMIT ?' : ''}`,
    limit ? [start, end, limit] : [start, end]);
  const total = rows.reduce((a, r) => a + Number(r.revenue), 0);
  const totalProfit = rows.reduce((a, r) => a + (Number(r.revenue) - Number(r.cogs)), 0);
  return rows.map((r) => {
    const d = withDerived(r);
    return { ...d, units_sold: Number(r.units_sold),
      revenue_share_pct: pct(d.revenue, total), profit_share_pct: totalProfit > 0 ? pct(d.gross_profit, totalProfit) : 0 };
  });
}

async function categoryPerformance({ start, end }) {
  const [rows] = await pool.query(
    `SELECT c.id AS category_id, c.name AS category,
            COALESCE(SUM(t.quantity),0) AS units_sold, COALESCE(SUM(t.line_total),0) AS revenue,
            COALESCE(SUM(t.quantity * t.unit_cost),0) AS cogs
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       LEFT JOIN (${ELIGIBLE_ITEMS}) t ON t.product_id = p.id
      GROUP BY c.id, c.name ORDER BY revenue DESC, c.name`, [start, end]);
  return rows.map((r) => ({ ...withDerived(r), units_sold: Number(r.units_sold) }));
}

// Active products that have stock but sold at most `maxUnits` in the last `days` days.
async function slowMoving({ days = 30, maxUnits = 0, minStock = 1 } = {}) {
  const [rows] = await pool.query(
    `SELECT p.id AS product_id, p.sku, p.name, c.name AS category, p.stock_qty,
            ROUND(p.stock_qty * p.cost_price, 2) AS stock_value,
            COALESCE(rec.units, 0) AS units_sold_recent,
            last.last_sold_at,
            DATEDIFF(NOW(), last.last_sold_at) AS days_since_last_sale
       FROM products p JOIN categories c ON c.id = p.category_id
       LEFT JOIN (SELECT si.product_id, SUM(si.quantity) AS units
                    FROM sale_items si JOIN sales s ON s.id = si.sale_id
                   WHERE s.status = 'COMPLETED' AND s.sold_at >= NOW() - INTERVAL ? DAY
                   GROUP BY si.product_id) rec ON rec.product_id = p.id
       LEFT JOIN (SELECT si.product_id, MAX(s.sold_at) AS last_sold_at
                    FROM sale_items si JOIN sales s ON s.id = si.sale_id
                   WHERE s.status = 'COMPLETED' GROUP BY si.product_id) last ON last.product_id = p.id
      WHERE p.is_active = 1 AND p.stock_qty >= ? AND COALESCE(rec.units, 0) <= ?
      ORDER BY stock_value DESC, p.name`, [days, minStock, maxUnits]);
  return rows.map((r) => ({ ...r, units_sold_recent: Number(r.units_sold_recent) }));
}

// ---- 4. Inventory analytics ----
async function inventorySnapshot() {
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS total_products, COALESCE(SUM(stock_qty),0) AS total_units,
            COALESCE(SUM(stock_qty * cost_price),0) AS stock_value,
            COALESCE(SUM(stock_qty > 0 AND stock_qty <= low_stock_threshold),0) AS low_stock_count,
            COALESCE(SUM(stock_qty = 0),0) AS out_of_stock_count
       FROM products WHERE is_active = 1`);
  return { total_products: Number(r.total_products), total_units: Number(r.total_units), stock_value: r2(r.stock_value),
           low_stock_count: Number(r.low_stock_count), out_of_stock_count: Number(r.out_of_stock_count) };
}

async function inventoryValuation() {
  const [rows] = await pool.query(
    `SELECT p.id AS product_id, p.sku, p.name, c.name AS category, p.stock_qty, p.cost_price, p.selling_price,
            ROUND(p.stock_qty * p.cost_price, 2) AS stock_value_at_cost,
            ROUND(p.stock_qty * p.selling_price, 2) AS stock_value_at_selling_price
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1 ORDER BY stock_value_at_cost DESC, p.name`);
  return rows;
}

async function lowStockList() {
  const [rows] = await pool.query(
    `SELECT p.id AS product_id, p.sku, p.name, c.name AS category, p.stock_qty, p.low_stock_threshold,
            CASE WHEN p.stock_qty = 0 THEN 'Out of stock' ELSE 'Low stock' END AS status,
            GREATEST(p.low_stock_threshold * 2 - p.stock_qty, 0) AS suggested_restock_qty
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1 AND p.stock_qty <= p.low_stock_threshold
      ORDER BY p.stock_qty ASC, p.name`);
  return rows;
}

async function recentSales(limit = 8) {
  const [rows] = await pool.query(
    `SELECT s.id, s.invoice_no, s.customer_name, s.total_amount, s.status, s.sold_at,
            (SELECT COALESCE(SUM(quantity),0) FROM sale_items WHERE sale_id = s.id) AS units
       FROM sales s ORDER BY s.sold_at DESC, s.id DESC LIMIT ?`, [limit]);
  return rows.map((r) => ({ ...r, units: Number(r.units) }));
}

// Per-sale report rows (used by the sales report/CSV).
async function salesReport({ start, end }, status) {
  const [rows] = await pool.query(
    `SELECT s.invoice_no, s.sold_at, COALESCE(s.customer_name, '') AS customer_name, s.status,
            SUM(si.quantity) AS units, s.total_amount AS revenue,
            ROUND(SUM(si.quantity * si.unit_cost), 2) AS cogs,
            ROUND(s.total_amount - SUM(si.quantity * si.unit_cost), 2) AS gross_profit
       FROM sales s JOIN sale_items si ON si.sale_id = s.id
      WHERE s.sold_at >= ? AND s.sold_at < ? ${status ? 'AND s.status = ?' : ''}
      GROUP BY s.id, s.invoice_no, s.sold_at, s.customer_name, s.status, s.total_amount
      ORDER BY s.sold_at DESC, s.id DESC LIMIT 10000`, status ? [start, end, status] : [start, end]);
  return rows.map((r) => ({ ...r, units: Number(r.units) }));
}

module.exports = { r2, salesKpis, salesTrend, monthlyTrendLast, comparePeriods, bestPeriods, productPerformance,
  categoryPerformance, slowMoving, inventorySnapshot, inventoryValuation, lowStockList, recentSales, salesReport };
