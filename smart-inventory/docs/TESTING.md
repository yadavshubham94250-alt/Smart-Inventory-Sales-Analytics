# Test plan and results

## What was actually executed (in the development sandbox: Ubuntu, Node 22, MySQL 8.0.46, Chromium 141)
| Layer | Tool | Result |
|---|---|---|
| Backend integration tests | `npm test` (Node test runner + supertest, real MySQL `sias_test`) | **35 / 35 passed** |
| API contract | Newman running `docs/postman/SIAS.postman_collection.json` | **40 requests, 46 assertions, 0 failed** |
| Browser end-to-end | Playwright + Chromium (`docs/e2e_browser_check.py`) | **28 / 28 checks passed** (desktop 1366×850 and mobile 390×800 *emulated viewport*) |
| SQL analytics | All 10 queries in `analytics_queries.sql` | Ran with 0 errors; Q6 equals dashboard KPIs |
| Data integrity | SQL invariant checks on the seeded DB | 0 violations (see `DATABASE.md`) |
| Negative control | Removed the `FOR UPDATE` row lock | Concurrency test **failed** (as it should), then passed after restoring the lock |

**Not executed / not claimed:** testing on real phones or other browsers (Firefox, Safari), load/performance testing, accessibility audit tooling (only labels/keyboard/contrast were designed for, not formally audited), the Postman *desktop app* itself (Newman is its official CLI runner), and any cloud deployment.

## Finding worth knowing (concurrency)
With 10 simultaneous 1-unit sales against 4 units of stock, overselling was prevented even *without* the explicit lock (InnoDB deadlock detection plus the `UNSIGNED` stock column acted as a backstop), but the losers received a confusing "system is busy" error. With the row lock the 6 losers all receive the correct *"Insufficient stock … available 0"*. The test asserts both the counts and the reason, so it fails if the lock is removed.

## Test cases
| # | Requirement | How covered | Expected |
|---|---|---|---|
| 1 | Valid login | `auth.test` · Postman 1.1 · Playwright | 200 + token, no hash in body |
| 2 | Invalid login | same | 401 generic message (also for unknown email) |
| 3 | Unauthorised access | `auth.test` · Postman 1.5 · Playwright | 401; UI redirects to /login |
| 4 | Product create/edit/archive | `products.test` · Postman 2 · Playwright | 201 / 200 / archived, history intact |
| 5 | Duplicate SKU | `products.test` | 409 (case-insensitive) |
| 6 | Invalid price/qty | `products.test` (7 bad payloads) · Playwright | 400 with field message |
| 7 | Successful sale | `sales.test` | 201, server total (2×100 + 3×49.99 = 349.97), stock reduced, movements logged |
| 8 | Insufficient stock | `sales.test` | 409 and **nothing** changed (rollback) |
| 9 | Simultaneous sales | `sales.test` (10 parallel vs stock 4) | exactly 4 succeed, 6 refused with stock message, final stock 0 |
| 10 | Rollback | `sales.test` (2-line sale, 2nd line short) | first line's stock unchanged, no sale/movement rows added |
| 11 | Client price tampering | `sales.test` · Postman 4.3 | submitted price/total ignored |
| 12 | Duplicate submission | `sales.test` (same idempotency key twice in parallel) | one sale, stock reduced once |
| 13 | Cancel/reverse | `sales.test` · Playwright | stock restored, reversal row, second cancel 409 |
| 14 | Calculation accuracy | `analytics.test` (hand-calculated) | revenue 550, COGS 280, profit 270, margin 49.09 %, AOV 183.33 |
| 15 | Captured unit cost | `analytics.test` | old sales' profit unchanged after cost change |
| 16 | Date-range analytics | `analytics.test` | empty range → zeros; invalid date → 400 |
| 17 | Period comparison | `analytics.test` | % change; `null` when previous is 0 |
| 18 | CSV export | `analytics.test` · Playwright download | headers, filters respected, formula injection (`=HYPERLINK`) neutralised, header-only when empty |
| 19 | Stock adjustments | `sales.test` | audit trail with user; cannot go below 0; reason required |
| 20 | SQL-injection attempts | `products.test` | sort whitelist → 400; search string parameterised → harmless |
| 21 | Mobile layout | Playwright 390 px | menu collapses/opens/closes, no horizontal page overflow (tables scroll inside their container) |
| 22 | API error handling | `auth.test` | bad JSON → 400, unknown route → 404 JSON |

## Representative Postman requests (all in the collection)
* `POST {{baseUrl}}/auth/login` body `{"email":"{{adminEmail}}","password":"{{adminPassword}}"}` → 200; script saves `token`.
* `POST /sales` body `{"items":[{"product_id":{{productId}},"quantity":99999}]}` → **409** "Insufficient stock for …".
* `GET /products?sort=name;DROP TABLE products` → **400**.
* `GET /reports/sales?format=csv&from=2026-01-01&to=2026-12-31` → 200, `Content-Type: text/csv`.

## Running them yourself
```powershell
cd backend; npm test                                   # automated tests
npx newman run ..\docs\postman\SIAS.postman_collection.json --env-var adminPassword=YourSeedPassword
```
(Postman folders expect the seeded data and a running backend.) The browser script needs `pip install playwright` and `python -m playwright install chromium`, then `python docs/e2e_browser_check.py` with both servers running; it creates and cancels one test product/sale in your dev database.
