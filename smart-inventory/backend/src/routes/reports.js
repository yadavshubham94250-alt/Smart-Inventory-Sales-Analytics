// Reports return JSON by default, or a CSV download with ?format=csv.
// They call the SAME service functions as the on-screen analytics, so exports always match the UI.
const router = require('express').Router();
const pool = require('../config/db');
const v = require('../utils/validate');
const { ok } = require('../utils/respond');
const { sendCsv } = require('../utils/csv');
const A = require('../services/analyticsService');

async function rangeOrDefault(q) {
  const given = v.dateRange(q);
  if (given.from || given.to) return given;
  const [[d]] = await pool.query(`SELECT DATE_FORMAT(CURDATE() - INTERVAL 29 DAY, '%Y-%m-%d') AS f, DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS t`);
  return v.dateRange({ from: d.f, to: d.t });
}
const stamp = (r) => `${r.from || 'start'}_to_${r.to || 'today'}`;
const wantsCsv = (q) => v.oneOf(q.format, 'format', ['json', 'csv']) === 'csv';

const COLS = {
  sales: [
    { header: 'Invoice No', key: 'invoice_no' }, { header: 'Date & Time (IST)', key: 'sold_at' },
    { header: 'Customer', key: 'customer_name' }, { header: 'Status', key: 'status' }, { header: 'Units', key: 'units' },
    { header: 'Revenue (INR)', key: 'revenue' }, { header: 'Cost of Goods Sold (INR)', key: 'cogs' }, { header: 'Gross Profit (INR)', key: 'gross_profit' },
  ],
  products: [
    { header: 'SKU', key: 'sku' }, { header: 'Product', key: 'name' }, { header: 'Category', key: 'category' },
    { header: 'Units Sold', key: 'units_sold' }, { header: 'Revenue (INR)', key: 'revenue' }, { header: 'Cost of Goods Sold (INR)', key: 'cogs' },
    { header: 'Gross Profit (INR)', key: 'gross_profit' }, { header: 'Gross Margin (%)', key: 'gross_margin_pct' },
    { header: 'Revenue Share (%)', key: 'revenue_share_pct' }, { header: 'Current Stock', key: 'stock_qty' },
  ],
  categories: [
    { header: 'Category', key: 'category' }, { header: 'Units Sold', key: 'units_sold' }, { header: 'Revenue (INR)', key: 'revenue' },
    { header: 'Cost of Goods Sold (INR)', key: 'cogs' }, { header: 'Gross Profit (INR)', key: 'gross_profit' }, { header: 'Gross Margin (%)', key: 'gross_margin_pct' },
  ],
  valuation: [
    { header: 'SKU', key: 'sku' }, { header: 'Product', key: 'name' }, { header: 'Category', key: 'category' },
    { header: 'Stock Qty', key: 'stock_qty' }, { header: 'Unit Cost (INR)', key: 'cost_price' }, { header: 'Selling Price (INR)', key: 'selling_price' },
    { header: 'Stock Value at Cost (INR)', key: 'stock_value_at_cost' }, { header: 'Stock Value at Selling Price (INR)', key: 'stock_value_at_selling_price' },
  ],
  lowStock: [
    { header: 'SKU', key: 'sku' }, { header: 'Product', key: 'name' }, { header: 'Category', key: 'category' }, { header: 'Status', key: 'status' },
    { header: 'Current Stock', key: 'stock_qty' }, { header: 'Low-stock Threshold', key: 'low_stock_threshold' }, { header: 'Suggested Restock Qty', key: 'suggested_restock_qty' },
  ],
};

router.get('/sales', async (req, res) => {
  const range = await rangeOrDefault(req.query);
  const status = v.oneOf(req.query.status, 'status', ['COMPLETED', 'CANCELLED']) || 'COMPLETED';
  const rows = await A.salesReport(range, status);
  if (wantsCsv(req.query)) return sendCsv(res, `sales_report_${stamp(range)}.csv`, COLS.sales, rows);
  ok(res, rows, 200, { range: { from: range.from, to: range.to }, status });
});

router.get('/products', async (req, res) => {
  const range = await rangeOrDefault(req.query);
  const rows = await A.productPerformance(range, { sort: 'revenue' });
  if (wantsCsv(req.query)) return sendCsv(res, `product_performance_${stamp(range)}.csv`, COLS.products, rows);
  ok(res, rows, 200, { range: { from: range.from, to: range.to } });
});

router.get('/categories', async (req, res) => {
  const range = await rangeOrDefault(req.query);
  const rows = await A.categoryPerformance(range);
  if (wantsCsv(req.query)) return sendCsv(res, `category_performance_${stamp(range)}.csv`, COLS.categories, rows);
  ok(res, rows, 200, { range: { from: range.from, to: range.to } });
});

router.get('/inventory-valuation', async (req, res) => {
  const rows = await A.inventoryValuation();
  if (wantsCsv(req.query)) return sendCsv(res, 'inventory_valuation.csv', COLS.valuation, rows);
  ok(res, rows, 200, { total_value_at_cost: A.r2(rows.reduce((a, r) => a + Number(r.stock_value_at_cost), 0)) });
});

router.get('/low-stock', async (req, res) => {
  const rows = await A.lowStockList();
  if (wantsCsv(req.query)) return sendCsv(res, 'low_stock_report.csv', COLS.lowStock, rows);
  ok(res, rows);
});

module.exports = router;
