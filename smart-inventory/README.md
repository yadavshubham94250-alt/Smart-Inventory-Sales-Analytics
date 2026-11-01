# Smart Inventory & Sales Analytics System

Full-stack inventory, sales and analytics web app (MCA minor project).
**React (Vite) + Bootstrap 5 + Chart.js · Node.js + Express · MySQL 8 · JWT + bcrypt**

| What | Where |
|---|---|
| Backend API (Express) | `backend/` |
| Frontend (React) | `frontend/` |
| SQL schema, analytics queries | `backend/sql/` |
| Automated tests (35) | `backend/tests/` |
| Postman collection (40 requests) | `docs/postman/` |
| Documentation, report, viva | `docs/` |

## 1. Prerequisites (Windows)
* **Node.js 20 or newer** (`node -v`) - https://nodejs.org
* **MySQL 8** (`mysql --version`) - developed and tested on MySQL 8.0 (MariaDB/XAMPP were not tested).
* **Git** (`git --version`)

## 2. Create the database and a MySQL user (PowerShell)
```powershell
mysql -u root -p
```
Then, inside the MySQL prompt (choose your own password):
```sql
CREATE DATABASE sias_db CHARACTER SET utf8mb4;
CREATE DATABASE sias_test CHARACTER SET utf8mb4;      -- used only by automated tests
CREATE USER 'sias'@'localhost' IDENTIFIED BY 'choose_a_password';
GRANT ALL PRIVILEGES ON sias_db.*   TO 'sias'@'localhost';
GRANT ALL PRIVILEGES ON sias_test.* TO 'sias'@'localhost';
EXIT;
```

## 3. Backend setup
```powershell
cd backend
npm install
Copy-Item .env.example .env
notepad .env          # set DB_PASSWORD, JWT_SECRET, SEED_ADMIN_* (see below)
```
Generate a strong `JWT_SECRET`:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Create tables and load ~6 months of demo data (25 products, ~600 sales, stock movements):
```powershell
npm run db:init
npm run db:seed
npm run dev          # API on http://localhost:5000/api/v1
```
**Verify:** open http://localhost:5000/api/v1/health - you should see `{"success":true,"data":{"status":"ok"}}`.

`npm run db:seed` only works on an empty database. To wipe and re-seed: `node src/utils/seed.js --reset` (**deletes all data**).
The seeded admin is `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from your `.env`. Seed dates are relative to today, so the dashboard always has recent data.

## 4. Frontend setup (a second PowerShell window)
```powershell
cd frontend
npm install
npm run dev          # http://localhost:5173
```
In development Vite proxies `/api` to `localhost:5000`, so no frontend `.env` is needed. Log in with the seeded admin.

## 5. Run the tests
```powershell
cd backend
npm test             # 35 tests against the separate sias_test database (never your real data)
```
Import `docs/postman/SIAS.postman_collection.json` into Postman and run the collection (backend must be running with seeded data; edit the `adminEmail`/`adminPassword` collection variables to match your `.env`).

## 6. How each stage can be verified
| Stage | Check |
|---|---|
| Database | `npm run db:init` prints "Tables are ready"; `SHOW TABLES;` lists 6 tables |
| Seed | `npm run db:seed` prints counts of products/sales/movements |
| Auth + products API | Postman folders 1-2 pass; `GET /products` without a token returns 401 |
| Inventory + sales | Postman folders 3-4 pass; `npm test` passes (includes the concurrency test) |
| Frontend | Log in, see dashboard KPIs and charts |
| Analytics | Run `backend/sql/analytics_queries.sql`; Q6 equals the dashboard KPIs for the same dates |
| Reports | Reports page downloads CSV files that open in Excel |

## 7. Business rules (summary)
* Only **COMPLETED** sales count in revenue/profit. **Cancelled** sales are kept for audit but excluded.
* Revenue = Σ quantity × selling price · COGS = Σ quantity × *unit cost captured at the time of sale* · **Gross profit** = Revenue − COGS · Gross margin % = Gross profit ÷ Revenue × 100 · AOV = Revenue ÷ completed sales.
* **Gross profit is not net profit** (no rent, wages, tax). Stock value = Σ stock × *current* purchase cost (active products).
* **Not supported (by design):** discounts, taxes/GST, partial returns (a sale is cancelled as a whole), multiple users/roles, multi-branch.
* Low stock = `0 < stock ≤ threshold`; out of stock = `0`.
* Products are **archived, never deleted**. Stock changes only through sales, cancellations or recorded adjustments.
* Times are stored and shown as **IST (UTC+05:30)**; money is `DECIMAL(12,2)` shown in INR (₹).

## 8. Security notes
Passwords are bcrypt-hashed; JWTs (8 h) are verified on every API call; SQL is fully parameterised (sort columns use a whitelist); inputs are validated on the server; Helmet, CORS allow-list and login rate-limiting are enabled; stack traces are hidden in production; `.env` is git-ignored.
**Token storage trade-off:** the JWT is kept in `sessionStorage` (cleared when the tab closes, never sent automatically, so no CSRF). The cost is that injected JavaScript (XSS) could read it; the app mitigates this by rendering only React-escaped text. HttpOnly cookies avoid XSS theft but then require CSRF protection and `SameSite`/`Secure` configuration. Secrets never go in `VITE_` variables, which are public.

## 9. Deployment and Git
See `docs/DEPLOYMENT.md` (Git/GitHub workflow, free-tier hosting options, environment variables). **No deployment has been performed for this project; add your own live URL where the report says `[DEPLOYED URL]`.**

## 10. Documentation index
`docs/API.md` · `docs/DATABASE.md` (ER diagram) · `docs/ARCHITECTURE.md` · `docs/ANALYTICS.md` (queries + hand-verified numbers) · `docs/TESTING.md` · `docs/DEPLOYMENT.md` · `docs/REPORT.md` · `docs/PRESENTATION.md` · `docs/VIVA.md` · `docs/RESUME.md`
