# Viva questions and answers

## Project and design
**1. Why this project?** Small shops lose money to stock-outs, dead stock and invisible margins; it lets me apply full-stack skills and SQL analytics to a real problem.
**2. Explain the architecture.** React SPA → Express REST API → MySQL. Routes validate input, services hold business logic (sales transactions, analytics SQL), mysql2 runs parameterised queries.
**3. Why REST and JSON?** Stateless, standard HTTP verbs/status codes, easy to test with Postman, and any client can reuse it.
**4. Why MySQL, not MongoDB?** Money and stock need ACID transactions, foreign keys and joins/aggregations - all natural in a relational database.
**5. Why six tables?** Each fact has one home: users, categories, products, sales (header), sale_items (lines), inventory_movements (ledger). No extra table was needed.
**6. Is the database normalised?** 3NF, except deliberate snapshots in `sale_items` (name, SKU, price, cost) and `sales.total_amount` so history never changes when a product changes.
**7. Why store `unit_cost` in each sale line?** If cost changes later, old profit must not change. Tested: raise cost 60→80; old sale still shows profit 110.
**8. Why DECIMAL, not FLOAT?** Floats cannot represent 0.1 exactly; money needs exact arithmetic. I also do line maths in integer paise.

## Reliability
**9. How do you stop overselling?** A transaction locks product rows with `SELECT … FOR UPDATE`; the second buyer waits, then sees reduced stock and gets "Insufficient stock". Proven by a test of 10 simultaneous sales against 4 units.
**10. Why lock rows in id order?** So two sales with the same products in different order cannot deadlock.
**11. What if the server crashes mid-sale?** The transaction is not committed, so MySQL rolls it back: no sale, no stock change.
**12. What is an idempotency key?** A unique ID per submission; a double-click or retry returns the same sale instead of creating a second one.
**13. Can stock change silently?** No. Product edit cannot touch stock; only sales, cancellations and adjustments do, each logging before/change/after, reason, user, time.
**14. Why archive instead of delete?** Foreign keys and audit history need the product to exist. Archived items are hidden from sales and lists but restorable.
**15. How do you handle cancellations?** Status → CANCELLED, stock restored through SALE_REVERSAL ledger rows, excluded from all analytics, kept for audit.

## Security
**16. How are passwords stored?** bcrypt hashes (salted, slow); never plaintext; hash never returned by the API.
**17. How does JWT work here?** Login returns a signed token (HS256, 8 h). The client sends it as a Bearer header; middleware verifies signature and expiry on every call.
**18. Where do you store the token and what is the risk?** `sessionStorage`: not auto-sent (no CSRF), cleared on tab close, but readable by injected JS (XSS). HttpOnly cookies resist XSS but need CSRF protection. I chose sessionStorage and avoid `dangerouslySetInnerHTML`.
**19. SQL injection?** All values are bound parameters; the only dynamic SQL (sort column) comes from a whitelist. A test sends an injection string in `sort` and gets 400.
**20. Why validate on both client and server?** Client validation is for speed and UX; the server is the real gatekeeper because the client can be bypassed (Postman).
**21. Why not trust the price from the frontend?** A user could edit it. The server reloads price and cost from the database; a test sends a fake price and it is ignored.
**22. Why can't I put the JWT secret in a Vite variable?** `VITE_` variables are bundled into public JavaScript.

## Analytics
**23. Define revenue, gross profit, margin.** Revenue = Σ qty × selling price; gross profit = revenue − COGS; margin = profit ÷ revenue × 100. It is **not net profit** (no expenses/tax).
**24. How are cancelled sales handled?** Every analytics query filters `status = 'COMPLETED'`.
**25. What about divide-by-zero?** Margin and AOV return 0 when the denominator is 0; period % change returns null ("n/a") when the earlier value is 0.
**26. Stock value vs revenue vs profit?** Stock value = what unsold stock cost me (asset); revenue = money from sales; profit = revenue − cost of what was sold.
**27. Walk me through one query.** (Q5) Join sales→sale_items, filter completed and date range, group by product, sum line_total and quantity×unit_cost, subtract; `NULLIF` guards the margin division.
**28. How do you know the numbers are right?** Hand-calculated dataset (revenue 550, profit 270, margin 49.09 %) asserted in an automated test; and raw SQL Q6 equals dashboard KPIs.
**29. What does slow-moving mean?** In stock, but no (or few) sales in the last N days; shows money tied up at cost, to decide on discounts or stopping reorders.

## Frontend / integration
**30. Props vs state?** Props are inputs passed down (e.g. `KpiCard label value`); state (`useState`) is data a component owns and re-renders on change (cart, filters).
**31. Where do you fetch data?** `useFetch` hook (`useEffect` + `fetch` via `api/client.js`) returns data/loading/error/reload; `Async` shows spinner, error with retry, empty state, or content.
**32. How is protected routing done?** A `Protected` wrapper checks auth context; no user → redirect to `/login`. Real protection is server-side (401).
**33. How is responsiveness achieved?** Bootstrap grid + CSS: fixed sidebar ≥ 992 px, off-canvas menu below; tables scroll inside their own container.
**34. Why debounce search?** To avoid an API call per keystroke.

## Testing and honesty
**35. What did you test?** 35 backend integration tests on a separate DB, 40-request Postman/Newman collection, 28-check browser run, 10 SQL queries; a negative control proving the concurrency test detects a missing lock.
**36. What did you not test?** Real devices, other browsers, load, formal accessibility audit, cloud deployment.
**37. Biggest bug you found?** Seeded sales were future-dated for "today" (found because the newest-first list showed the wrong sale); also a hidden screen-reader element widened the mobile page. Both fixed and re-tested.
**38. Limitations?** One role, no tax/discounts/partial returns, IST only, token in sessionStorage, in-memory rate limiter.
**39. How would you scale?** Add read replicas/caching for analytics, pre-aggregated daily summary table, queue for reports, cookie-based sessions with refresh tokens.
**40. What would you add next?** Roles, purchase orders, GST invoices, and the forecasting extension (`EXTENSION.md`).
