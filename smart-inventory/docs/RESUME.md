# Resume-ready description (truthful, no inflated claims)

**Smart Inventory & Sales Analytics System** - MCA minor project · React, Node.js/Express, MySQL · [GitHub URL]
* Built a full-stack inventory and sales web app (React + Bootstrap frontend, Express REST API, MySQL) with JWT/bcrypt authentication, product and stock management, and a sales module with cancellation.
* Implemented transactional sales using MySQL row locking and idempotency keys; verified with an automated test that 10 concurrent sales against 4 units of stock produce exactly 4 successes and no overselling.
* Designed a 6-table normalised schema with an auditable stock-movement ledger and captured unit costs so historical gross profit stays correct.
* Wrote SQL analytics (revenue, gross profit/margin, AOV, top and slow-moving products, period comparison) powering a Chart.js dashboard and CSV reports.
* Tested with 35 automated integration tests, a 40-request Postman/Newman collection and a 28-check Playwright browser run.

**Shorter version:** *Full-stack inventory & sales analytics app (React, Express, MySQL): JWT auth, concurrency-safe transactional sales, SQL-driven KPIs and CSV reports; 35 automated tests.*
**Add only if true for you:** deployed URL; your own test run results.
