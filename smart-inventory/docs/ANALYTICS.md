# Data analytics methodology

All figures come from SQL over `sales`, `sale_items`, `products`, `inventory_movements`. Nothing is hard-coded or computed in the browser.

## Definitions
| Measure | Formula | Notes |
|---|---|---|
| Eligible sale | `sales.status = 'COMPLETED'` | Cancelled sales are excluded from **every** measure below |
| Revenue | Σ `line_total` (= quantity × actual selling price at sale time) | Not affected by later price changes |
| Cost of goods sold (COGS) | Σ quantity × `unit_cost` (cost **captured at sale time**) | Not affected by later cost changes |
| **Gross profit** | Revenue − COGS | **Not net profit**: rent, wages, utilities, tax are not modelled |
| Gross margin % | Gross profit ÷ Revenue × 100 | `0` when revenue = 0 (no division by zero) |
| Average order value | Revenue ÷ number of eligible sales | `0` when there are no sales |
| Current stock value | Σ `stock_qty` × current `cost_price` (active products) | An *asset* value, **not** revenue or profit; archived products excluded |
| Period change % | (A − B) ÷ B × 100 | `null` ("n/a") when B = 0, because the change is undefined |
| Low / out of stock | `0 < stock ≤ threshold` / `stock = 0` | Active products only |
| Slow-moving | active, `stock > 0`, units sold in last N days ≤ `max_units` (default 0) | Shows money tied up at cost |
| Weeks | start on Monday | Time zone IST |

**Scope decisions:** discounts, taxes/GST and partial returns are **not supported**. Returns are modelled as whole-sale cancellation, which restores stock and removes the sale from all analytics.

## The 10 queries (`backend/sql/analytics_queries.sql`, all executed without error)
| # | Business question | Output columns | Decision it supports |
|---|---|---|---|
| Q1 | Revenue by month | month, orders, revenue, cogs, gross_profit | Spot seasonality; plan purchasing |
| Q2 | Top 5 products by revenue | product_name, units_sold, revenue | Never run out of these; negotiate price |
| Q3 | Top products by units | product_name, units_sold, revenue | Reorder frequency, shelf space |
| Q4 | Category-wise revenue and share | category, units_sold, revenue, revenue_share_pct | Where to widen the range |
| Q5 | Gross profit by product | product_name, revenue, cogs, gross_profit, gross_margin_pct | Push high-margin items, fix thin margins |
| Q6 | Headline KPIs incl. AOV | orders, units, revenue, gross_profit, gross_margin_pct, avg_order_value | Period scorecard |
| Q7 | Low / out-of-stock | sku, name, stock_qty, threshold, status, suggested_restock_qty | Today's purchase list |
| Q8 | Slow-moving stock | sku, name, stock_qty, money_tied_up, last_sold_at | Discount / bundle / stop buying |
| Q9 | Inventory valuation by category (with total via `WITH ROLLUP`) | category, units, stock_value_at_cost | Working-capital view |
| Q10 | Period vs previous equal-length period | revenue/profit current, previous, change % | Growth check |

**Cross-check (executed):** with the demo database and the dashboard range 2026-09-27 → 2026-10-26, Q6 returned `134 orders · 815 units · ₹109,515.00 revenue · ₹17,104.00 gross profit · 15.62% margin · ₹817.28 AOV`, identical to the dashboard cards. Q10 returned +5.37% revenue and +3.47% profit versus the previous 30 days.
*(Your own numbers will differ: the demo data is generated relative to the day you seed it.)*

## Hand-verifiable example (also an automated test: `tests/analytics.test.js`)
Products: **A** cost ₹60, price ₹100, stock 100 · **B** cost ₹20, price ₹50, stock 100.

| Sale | Lines | Revenue | COGS | Gross profit |
|---|---|---|---|---|
| 1 | 2×A + 1×B | 2×100 + 1×50 = **250** | 2×60 + 1×20 = **140** | **110** |
| 2 | 1×A | **100** | **60** | **40** |
| 3 | 4×B | 4×50 = **200** | 4×20 = **80** | **120** |
| **Total** | | **550** | **280** | **270** |

* Gross margin = 270 ÷ 550 × 100 = **49.09 %** · Orders = 3 · AOV = 550 ÷ 3 = **₹183.33** · Units = 3+5 = 8.
* Product ranking by revenue: A = 300 (54.55 % share), B = 250. By units: B = 5, A = 3.
* Stock value now: A 97 × 60 = 5,820; B 95 × 20 = 1,900 → **₹7,720**.
* **Captured-cost proof:** raise A's cost to ₹80, then sell 1×A (revenue 100, COGS 80, profit 20). Sale 1 still shows profit 110 (unchanged).
* **Cancellation proof:** cancel Sale 3 → revenue 250 + 100 + 100 = **450**, COGS 140 + 60 + 80 = **280**, profit **170**, orders 3, AOV **150**; B's stock returns to 99, so stock value = 96 × 80 + 99 × 20 = **₹9,660**.
These exact values are asserted by the automated test and pass.

## Chart ↔ query map
Dashboard monthly trend → Q1 (6 months) · Top-5 chart → Q2 · Category doughnut → Q4 · KPI cards → Q6 + valuation (Q9) · Low-stock panel → Q7 · Analytics "Slow-moving" → Q8 · "Compare two periods" → Q10.
