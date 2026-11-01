# REST API reference (`/api/v1`)

**Envelope.** Success: `{ "success": true, "data": ..., "meta": ... }`. Failure: `{ "success": false, "error": { "message": "...", "details": { "field": "problem" } } }`.
**Auth.** Everything except `/health`, `/auth/login`, `/auth/register` needs `Authorization: Bearer <JWT>`.
**Dates** are `YYYY-MM-DD` (inclusive on both ends). **Money** is a number with ≤ 2 decimals in INR.
**Status codes:** 200 OK · 201 Created · 400 validation · 401 not logged in/expired · 403 forbidden · 404 not found · 409 conflict (duplicate SKU, insufficient stock, already cancelled, busy) · 413 body too large · 500 server error.

| Method | Endpoint | Purpose | Auth | Request | Success | Errors |
|---|---|---|---|---|---|---|
| GET | `/health` | Liveness | No | - | 200 `{status:"ok"}` | - |
| POST | `/auth/register` | Create the **first** admin (closed afterwards) | No | `name, email, password` (≥8 chars, letter+digit) | 201 `{token,user}` | 400, 403 |
| POST | `/auth/login` | Log in | No | `email, password` | 200 `{token,user}` | 400, 401, 429 |
| GET | `/auth/me` | Validate token / current user | Yes | - | 200 `{user}` | 401 |
| POST | `/auth/logout` | Logout (client discards token) | Yes | - | 200 | 401 |
| GET | `/categories` | List with product counts | Yes | - | 200 `[{id,name,product_count}]` | 401 |
| POST | `/categories` | Create | Yes | `name` | 201 | 400, 409 |
| PUT | `/categories/:id` | Rename | Yes | `name` | 200 | 400, 404, 409 |
| DELETE | `/categories/:id` | Delete (only if empty) | Yes | - | 200 | 404, 409 |
| GET | `/products` | List | Yes | query: `search, category_id, status(in_stock\|low_stock\|out_of_stock), active(1\|0\|all), sort(name\|price\|stock\|created), order(asc\|desc), page, limit(≤100)` | 200 `[product]` + `meta{page,limit,total,totalPages}` | 400 |
| GET | `/products/:id` | One product | Yes | - | 200 | 404 |
| POST | `/products` | Create (+INITIAL stock movement) | Yes | `sku, name, category_id, cost_price, selling_price, stock_qty, low_stock_threshold, description?` | 201 | 400, 409 (duplicate SKU) |
| PUT | `/products/:id` | Edit details (**not** stock) | Yes | same, without `stock_qty` | 200 | 400, 404, 409 |
| DELETE | `/products/:id` | **Archive** (soft delete) | Yes | - | 200 `{archived:true}` | 404 |
| PATCH | `/products/:id/restore` | Un-archive | Yes | - | 200 | 404 |
| POST | `/inventory/adjust` | Restock or adjust stock (locked, audited) | Yes | `product_id, movement_type(RESTOCK\|ADJUSTMENT), quantity_change(int≠0), reason(≥3)` | 201 `{quantity_before,quantity_after,...}` | 400, 404, 409 (would go below 0) |
| GET | `/inventory/movements` | Movement history | Yes | `product_id, type, from, to, page, limit` | 200 + meta | 400 |
| GET | `/inventory/alerts` | Low / out-of-stock lists | Yes | - | 200 `{low_stock[],out_of_stock[]}` | - |
| POST | `/sales` | Create sale (transactional) | Yes | `items[{product_id,quantity}], customer_name?, idempotency_key?` (any prices/totals sent are **ignored**) | 201 sale (200 + `meta.duplicate` if key reused) | 400, 409 (stock/archived/missing product) |
| GET | `/sales` | History | Yes | `from, to, status, search(invoice/id/customer), product_id, page, limit` | 200 + meta | 400 |
| GET | `/sales/:id` | Details with line items & profit | Yes | - | 200 | 404 |
| POST | `/sales/:id/cancel` | Reverse sale, return stock | Yes | `reason(≥3)` | 200 sale (CANCELLED) | 400, 404, 409 (already cancelled) |
| GET | `/analytics/dashboard` | KPIs, 6-month trend, top 5, category sales, recent sales, low-stock | Yes | `from, to` (default last 30 days) | 200 | 400 |
| GET | `/analytics/sales-trend` | Revenue/profit by period | Yes | `granularity(daily\|weekly\|monthly), from, to` | 200 | 400 |
| GET | `/analytics/summary` | KPIs + best months/weekdays/days | Yes | `from, to` | 200 | 400 |
| GET | `/analytics/compare` | Period A vs B with % change | Yes | `from_a,to_a,from_b,to_b` (all required) | 200 | 400 |
| GET | `/analytics/products` | Product performance | Yes | `sort(revenue\|units\|profit), limit, only_sold=1, from, to` | 200 | 400 |
| GET | `/analytics/categories` | Category comparison | Yes | `from, to` | 200 | 400 |
| GET | `/analytics/slow-moving` | In stock but not selling | Yes | `days, max_units, min_stock` | 200 | 400 |
| GET | `/analytics/inventory` | Snapshot + valuation | Yes | - | 200 | - |
| GET | `/reports/sales` | Sales report (JSON or CSV) | Yes | `from, to, status(COMPLETED\|CANCELLED), format=csv` | 200 | 400 |
| GET | `/reports/products` | Product performance | Yes | `from, to, format=csv` | 200 | 400 |
| GET | `/reports/categories` | Category performance | Yes | `from, to, format=csv` | 200 | 400 |
| GET | `/reports/inventory-valuation` | Stock valuation | Yes | `format=csv` | 200 | - |
| GET | `/reports/low-stock` | Restock list | Yes | `format=csv` | 200 | - |

## Examples
**Login** `POST /auth/login` `{"email":"admin@example.com","password":"Admin1234"}` → `200 {"success":true,"data":{"token":"eyJ...","user":{"id":1,"name":"Store Admin","email":"admin@example.com","role":"admin"}}}`

**Create sale** `POST /sales` `{"customer_name":"Asha","idempotency_key":"b1f0...","items":[{"product_id":3,"quantity":2}]}` → `201` with `invoice_no` (`INV-YYYYMMDD-00001`), server-computed `total_amount`, and `items[]` containing `unit_price`, captured `unit_cost`, `line_total`, `line_profit`.

**Insufficient stock** → `409 {"success":false,"error":{"message":"Insufficient stock for Coca-Cola 750ml: requested 50, available 21","details":{"items":["..."]}}}`

**Validation** → `400 {"success":false,"error":{"message":"selling_price cannot be negative","details":{"selling_price":"selling_price cannot be negative"}}}`
