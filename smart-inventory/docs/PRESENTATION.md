# Presentation outline (10-12 minutes, 12 slides)
1. **Title** - name, guide, one-line pitch: "From manual registers to data-driven stock decisions."
2. **Problem** - 3 pains: stock blind spots, no profit visibility, overselling/errors.
3. **Objectives & scope** - what is in (inventory, sales, analytics) and honestly out (tax, discounts, roles).
4. **Architecture** - 3-tier diagram (`ARCHITECTURE.md`); say why REST + JWT.
5. **Database** - ER diagram; highlight snapshots (`unit_cost`) and the movement ledger.
6. **Live demo A** - login → dashboard KPIs → change date range (numbers change).
7. **Live demo B** - add product (validation error, duplicate SKU) → sell 2 items → stock drops → movement history shows it → cancel sale → stock returns.
8. **Reliability** - transaction + row lock + idempotency; show the 10-parallel-sales test result and the "fails without the lock" control.
9. **Analytics** - formulas slide (revenue, COGS, gross profit ≠ net profit); show Q6 SQL equals dashboard.
10. **Security** - bcrypt, JWT, parameterised SQL, validation, rate limit, secrets in `.env`; the sessionStorage trade-off stated honestly.
11. **Testing** - 35 tests, 40 API requests, 28 browser checks (real numbers); what was *not* tested.
12. **Limitations & future work** - roles, GST, purchase orders, forecasting extension; thank-you + questions.
**Demo tips:** reseed fresh data before the viva (`node src/utils/seed.js --reset`), keep both servers running, have Postman and `analytics_queries.sql` open in tabs.
