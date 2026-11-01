-- ============================================================================
-- Smart Inventory & Sales Analytics - the 10 core analytical SQL queries
-- Run in MySQL Workbench / mysql CLI against sias_db.
-- Parameters (edit the 3 lines below):
-- ============================================================================
SET time_zone = '+05:30';                       -- the app stores IST
SET @from = '2026-09-27 00:00:00';              -- inclusive start
SET @to   = '2026-10-27 00:00:00';              -- EXCLUSIVE end (= last day + 1)
SET @days = 30;                                 -- look-back window for slow-moving stock
-- RULE USED EVERYWHERE: only sales.status = 'COMPLETED' count. Cancelled sales are ignored.
-- Revenue = SUM(line_total) ; COGS = SUM(quantity * unit_cost) ; Gross profit = Revenue - COGS

-- Q1. Monthly revenue ------------------------------------------------------
-- Business question: Which months were strong or weak?  Output: month, orders, revenue, cogs, gross_profit
SELECT DATE_FORMAT(s.sold_at, '%Y-%m') AS month,
       COUNT(DISTINCT s.id) AS orders,
       SUM(si.line_total) AS revenue,
       SUM(si.quantity * si.unit_cost) AS cogs,
       SUM(si.line_total) - SUM(si.quantity * si.unit_cost) AS gross_profit
  FROM sales s JOIN sale_items si ON si.sale_id = s.id
 WHERE s.status = 'COMPLETED'
 GROUP BY month ORDER BY month;

-- Q2. Top 5 products by revenue -------------------------------------------
-- Business question: Which products earn the most money?  Decision: keep these always in stock, negotiate supplier prices.
SELECT si.product_name, SUM(si.quantity) AS units_sold, SUM(si.line_total) AS revenue
  FROM sales s JOIN sale_items si ON si.sale_id = s.id
 WHERE s.status = 'COMPLETED' AND s.sold_at >= @from AND s.sold_at < @to
 GROUP BY si.product_id, si.product_name ORDER BY revenue DESC LIMIT 5;

-- Q3. Top products by units sold ------------------------------------------
-- Business question: What moves fastest (volume)?  Decision: reorder frequency and shelf space. Often differs from Q2.
SELECT si.product_name, SUM(si.quantity) AS units_sold, SUM(si.line_total) AS revenue
  FROM sales s JOIN sale_items si ON si.sale_id = s.id
 WHERE s.status = 'COMPLETED' AND s.sold_at >= @from AND s.sold_at < @to
 GROUP BY si.product_id, si.product_name ORDER BY units_sold DESC, revenue DESC LIMIT 10;

-- Q4. Category-wise revenue and share -------------------------------------
-- Business question: Which categories drive the business?  Decision: where to expand the range.
SELECT c.name AS category, SUM(si.quantity) AS units_sold, SUM(si.line_total) AS revenue,
       ROUND(100 * SUM(si.line_total) / SUM(SUM(si.line_total)) OVER (), 2) AS revenue_share_pct
  FROM sales s JOIN sale_items si ON si.sale_id = s.id
  JOIN products p ON p.id = si.product_id JOIN categories c ON c.id = p.category_id
 WHERE s.status = 'COMPLETED' AND s.sold_at >= @from AND s.sold_at < @to
 GROUP BY c.id, c.name ORDER BY revenue DESC;

-- Q5. Gross profit by product (uses the cost captured at sale time) -------
-- Business question: Which products really make profit - not just revenue?  Decision: push high-margin items, review pricing on thin-margin ones.
SELECT si.product_name, SUM(si.line_total) AS revenue,
       SUM(si.quantity * si.unit_cost) AS cogs,
       SUM(si.line_total) - SUM(si.quantity * si.unit_cost) AS gross_profit,
       ROUND(100 * (SUM(si.line_total) - SUM(si.quantity * si.unit_cost)) / NULLIF(SUM(si.line_total), 0), 2) AS gross_margin_pct
  FROM sales s JOIN sale_items si ON si.sale_id = s.id
 WHERE s.status = 'COMPLETED' AND s.sold_at >= @from AND s.sold_at < @to
 GROUP BY si.product_id, si.product_name ORDER BY gross_profit DESC;

-- Q6. Headline KPIs: revenue, profit, margin, average order value ---------
-- Business question: How did the business do in this period?  NULLIF avoids division by zero.
SELECT COUNT(DISTINCT s.id) AS orders, SUM(si.quantity) AS units,
       SUM(si.line_total) AS revenue,
       SUM(si.line_total) - SUM(si.quantity * si.unit_cost) AS gross_profit,
       ROUND(100 * (SUM(si.line_total) - SUM(si.quantity * si.unit_cost)) / NULLIF(SUM(si.line_total), 0), 2) AS gross_margin_pct,
       ROUND(SUM(si.line_total) / NULLIF(COUNT(DISTINCT s.id), 0), 2) AS avg_order_value
  FROM sales s JOIN sale_items si ON si.sale_id = s.id
 WHERE s.status = 'COMPLETED' AND s.sold_at >= @from AND s.sold_at < @to;

-- Q7. Low-stock and out-of-stock products ---------------------------------
-- Business question: What must be reordered now?  Decision: purchase list; suggested qty = 2 x threshold - stock.
SELECT p.sku, p.name, p.stock_qty, p.low_stock_threshold,
       CASE WHEN p.stock_qty = 0 THEN 'Out of stock' ELSE 'Low stock' END AS status,
       GREATEST(p.low_stock_threshold * 2 - p.stock_qty, 0) AS suggested_restock_qty
  FROM products p WHERE p.is_active = 1 AND p.stock_qty <= p.low_stock_threshold
 ORDER BY p.stock_qty, p.name;

-- Q8. Slow-moving: in stock, nothing sold in the last @days days ----------
-- Business question: Where is cash tied up in goods that do not sell?  Decision: discount, bundle, or stop reordering.
SELECT p.sku, p.name, p.stock_qty, ROUND(p.stock_qty * p.cost_price, 2) AS money_tied_up,
       (SELECT MAX(s.sold_at) FROM sale_items x JOIN sales s ON s.id = x.sale_id
         WHERE x.product_id = p.id AND s.status = 'COMPLETED') AS last_sold_at
  FROM products p
 WHERE p.is_active = 1 AND p.stock_qty > 0
   AND NOT EXISTS (SELECT 1 FROM sale_items x JOIN sales s ON s.id = x.sale_id
                    WHERE x.product_id = p.id AND s.status = 'COMPLETED' AND s.sold_at >= NOW() - INTERVAL @days DAY)
 ORDER BY money_tied_up DESC;

-- Q9. Current inventory valuation -----------------------------------------
-- Business question: How much money is sitting in stock?  Value is at PURCHASE COST (not selling price, not profit).
SELECT c.name AS category, SUM(p.stock_qty) AS units, ROUND(SUM(p.stock_qty * p.cost_price), 2) AS stock_value_at_cost
  FROM products p JOIN categories c ON c.id = p.category_id WHERE p.is_active = 1
 GROUP BY c.id, c.name WITH ROLLUP;

-- Q10. Period-over-period comparison (selected period vs the previous period of equal length) ----
-- Business question: Are we growing?  % change is NULL when the earlier value is 0 (undefined).
WITH bounds AS (SELECT @from AS cur_from, @to AS cur_to, DATE_SUB(@from, INTERVAL DATEDIFF(@to, @from) DAY) AS prev_from, @from AS prev_to),
     t AS (SELECT CASE WHEN s.sold_at >= b.cur_from THEN 'current' ELSE 'previous' END AS period, s.id AS sale_id, si.line_total, si.quantity, si.unit_cost
             FROM bounds b JOIN sales s ON s.status = 'COMPLETED' AND s.sold_at >= b.prev_from AND s.sold_at < b.cur_to
             JOIN sale_items si ON si.sale_id = s.id),
     agg AS (SELECT period, SUM(line_total) AS revenue, SUM(line_total) - SUM(quantity * unit_cost) AS gross_profit, COUNT(DISTINCT sale_id) AS orders FROM t GROUP BY period)
SELECT cur.revenue AS revenue_current, prev.revenue AS revenue_previous,
       ROUND(100 * (cur.revenue - prev.revenue) / NULLIF(prev.revenue, 0), 2) AS revenue_change_pct,
       cur.gross_profit AS profit_current, prev.gross_profit AS profit_previous,
       ROUND(100 * (cur.gross_profit - prev.gross_profit) / NULLIF(prev.gross_profit, 0), 2) AS profit_change_pct
  FROM agg cur JOIN agg prev ON cur.period = 'current' AND prev.period = 'previous';
