<!-- Replace every [PLACEHOLDER]. Nothing in this report is invented: test figures are real runs listed in TESTING.md. -->

# SMART INVENTORY & SALES ANALYTICS SYSTEM
### A Minor Project Report submitted in partial fulfilment of the requirements for the degree of **Master of Computer Applications (MCA)**

| | |
|---|---|
| **Student name** | [YOUR NAME] |
| **Roll / enrolment no.** | [ROLL NUMBER] |
| **Semester / year** | [SEMESTER, YEAR] |
| **Guide** | [GUIDE NAME, DESIGNATION] |
| **Department / University** | [DEPARTMENT], [UNIVERSITY NAME] |
| **Submission date** | [DATE] |
| **Source code** | [GITHUB URL] · **Live demo** [DEPLOYED URL, if any] |

*Certificate, declaration and acknowledgement pages: [ADD AS PER UNIVERSITY FORMAT]*

---
## 1. Abstract
Small retailers commonly track stock and sales in registers or spreadsheets, which makes it hard to know what is in stock, what sells, and how much is earned. This project delivers a full-stack web application for product and inventory management, transactional sales recording with automatic stock updates, low-stock alerts, and an analytics dashboard. Data is stored in MySQL and exposed through a REST API built with Node.js and Express, secured with JWT authentication and bcrypt password hashing, and consumed by a responsive React interface using Bootstrap and Chart.js. Analytics (revenue, cost of goods sold, gross profit, margin, average order value, top and slow-moving products, period comparison) are computed by SQL aggregations over trusted database data and can be exported as CSV. Sales are processed inside database transactions with row locking so concurrent sales cannot oversell stock, and every stock change is recorded in an audit ledger. The system was verified with 35 automated integration tests, a 40-request API collection and a 28-check browser walkthrough (Section 15).

## 2. Introduction
Inventory and sales data is the raw material of retail decisions: what to reorder, which products to promote, where money is tied up. Manual methods give delayed and error-prone answers. This project combines full-stack development (frontend, backend, database, authentication, testing) with data analytics (KPIs, trends, comparisons) in one working system.

## 3. Problem statement
Small businesses managing inventory manually find it difficult to monitor stock, identify high-performing products, analyse revenue and profit, detect slow-moving inventory and restock on time. An integrated system is needed to record operations reliably and convert them into actionable insight.

## 4. Objectives
1. Build a secure web application for product, inventory and sales management.
2. Keep stock and sales consistent automatically, with a full audit trail.
3. Provide analytics dashboards and downloadable reports based on SQL queries.
4. Demonstrate the TT syllabus: responsive frontend, REST API, MySQL, authentication, full-stack integration, testing, Git and deployment readiness.

## 5. Existing system and limitations
Paper registers and spreadsheets: no automatic stock deduction; easy to mistype or overwrite; no audit of who changed what; no protection against two people selling the last item; profit and slow-moving analysis requires manual work; no access control.

## 6. Proposed system
A role-protected web application that (a) stores products with cost, price and thresholds, (b) records sales atomically with server-calculated totals, (c) logs every stock movement, (d) archives rather than deletes products with history, (e) computes KPIs with SQL, and (f) exports reports. Scope limits are stated openly in Section 16.

## 7. Requirements
**Functional:** admin login/logout; product CRUD with search, filter, sort, pagination; stock restock/adjust with reasons; multi-line sales with confirmation, history, search and cancellation; dashboard KPIs and charts; analytics (trend, compare, top products, categories, slow-moving, valuation); CSV reports.
**Non-functional:** security (hashing, JWT, validation, parameterised SQL, rate-limiting); integrity (transactions, locking, idempotency); usability (responsive, accessible labels, clear errors, loading/empty states, INR formatting); maintainability (layered code, comments, tests); portability (environment-based configuration).

## 8. Technology stack
React 19 + Vite, React Router, Bootstrap 5, Chart.js/react-chartjs-2 · Node.js 20+/22, Express 5, mysql2, bcrypt, jsonwebtoken, helmet, cors, express-rate-limit · MySQL 8 · Node test runner, supertest, Postman/Newman, Playwright · Git/GitHub.

## 9. System architecture
See `ARCHITECTURE.md` (diagram and request lifecycle). Three tiers: React SPA → Express REST API (routes → services → mysql2) → MySQL.

## 10. ER diagram and database design
See `DATABASE.md`: six tables (`users, categories, products, sales, sale_items, inventory_movements`), keys, indexes, constraints, and the rationale for controlled denormalisation of sale snapshots.

## 11. API design
See `API.md`: versioned `/api/v1`, uniform JSON envelope, status codes 200/201/400/401/403/404/409/500, centralised error handling.

## 12. Implementation details
* **Authentication:** bcrypt (cost 10) hashes; JWT HS256 (8 h); middleware verifies each request; first-admin bootstrap closes after use; constant-time-style login to avoid user enumeration; login rate limiting.
* **Products:** server and client validation (SKU pattern/uniqueness, non-negative 2-decimal prices, whole-number stock); edits cannot change stock; delete = archive.
* **Inventory:** adjustments lock the row, reject negative results, and write a ledger row (before, change, after, reason, user).
* **Sales:** one transaction: lock products (ordered), validate, price from DB, insert header/lines (price **and cost** snapshot), decrement stock, insert movements, commit; any error rolls back. Idempotency key prevents duplicates. Cancellation reverses stock with `SALE_REVERSAL` rows.
* **Frontend:** function components, props, `useState`/`useEffect`, `useFetch` hook with loading/error/empty states, controlled forms with inline validation, modals/confirm dialogs, toasts, debounced search, responsive sidebar.
* **Security of storage:** token in `sessionStorage` (trade-offs in README §8).

## 13. Data analytics methodology and KPI definitions
See `ANALYTICS.md`: formulas for revenue, COGS, gross profit, margin, AOV, stock value; treatment of cancelled sales, zero denominators and empty ranges; 10 SQL queries; a hand-verified worked example.

## 14. Screenshots
[INSERT YOUR OWN SCREENSHOTS: login, dashboard, products, new sale, sale details, inventory movements, analytics, reports, mobile view.] *(Do not reuse another system's screenshots.)*

## 15. Testing and results
Results of runs actually performed during development (details in `TESTING.md`):
| Test | Result |
|---|---|
| Backend integration tests (real MySQL) | 35 passed, 0 failed |
| API collection via Newman | 40 requests, 46 assertions, 0 failed |
| Browser walkthrough (Chromium, desktop + emulated mobile) | 28 of 28 checks passed |
| 10 analytics queries | executed without errors; KPI query equals dashboard values |
| Concurrency (10 simultaneous sales vs 4 units) | exactly 4 succeeded; stock ended at 0; test fails if the row lock is removed |
**Your own run:** [RE-RUN ON YOUR MACHINE AND RECORD DATE/RESULTS HERE]. **Not tested:** real mobile devices, other browsers, load testing, cloud deployment.

## 16. Limitations
Single admin role; no discounts, taxes/GST, partial returns, suppliers/purchase orders, barcode scanning or multi-branch; gross profit only (not net profit); time zone fixed to IST; JWT in `sessionStorage` (XSS trade-off) with no refresh-token rotation or server-side revocation; in-memory rate limiter (per instance); demo data is synthetic; no formal load or accessibility audit.

## 17. Future enhancements
Roles (admin/cashier), purchase orders and suppliers, discounts and GST invoices (PDF), barcode scanning, partial returns, email/SMS low-stock alerts, HttpOnly-cookie auth with CSRF protection, and the optional **demand forecasting** extension (`EXTENSION.md`).

## 18. Conclusion
The system meets the stated objectives: a working, tested, documented full-stack application whose analytics are derived from trusted database data and whose stock and sales remain consistent under concurrent use. It demonstrates the TT syllabus end to end and the practical use of SQL for business analytics.

## 19. References
1. Express.js documentation - https://expressjs.com
2. React documentation - https://react.dev
3. MySQL 8.0 Reference Manual (InnoDB locking reads, transactions) - https://dev.mysql.com/doc/
4. Bootstrap 5 documentation - https://getbootstrap.com/docs/5.3/
5. Chart.js documentation - https://www.chartjs.org/docs/
6. OWASP Top 10 and Cheat Sheet Series (password storage, SQL injection, CSV injection) - https://owasp.org
7. JSON Web Token introduction - https://jwt.io/introduction
8. Node.js test runner documentation - https://nodejs.org/api/test.html
[ADD ANY BOOKS/PAPERS YOU ACTUALLY USED, IN YOUR UNIVERSITY'S CITATION STYLE]
