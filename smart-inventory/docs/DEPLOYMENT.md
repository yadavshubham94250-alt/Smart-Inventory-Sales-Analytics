# Git/GitHub workflow and deployment

> **Status:** nothing has been deployed by the author of this repo. Treat every URL placeholder below as yours to fill in. Free-tier limits and product names change often, so **check each provider's current terms** before relying on them.

## 1. Git and GitHub (PowerShell, from the project root)
```powershell
git init                                   # already done if you cloned
git add .
git status                                 # confirm .env is NOT listed
git commit -m "Initial commit: Smart Inventory & Sales Analytics System"
git branch -M main
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<your-username>/smart-inventory.git
git push -u origin main
```
Suggested workflow for the viva: one feature branch per stage (`git switch -c feature/sales-transactions`), small commits (`feat:`, `fix:`, `docs:`), merge to `main`. `.gitignore` already excludes `.env`, `node_modules` and `dist`. **If a secret is ever committed, rotate it** (deleting the file is not enough).

## 2. Environment variables
| Where | Variable | Value |
|---|---|---|
| Backend | `NODE_ENV` | `production` (hides error details) |
| Backend | `PORT` | provided by host (the app reads it) |
| Backend | `DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME` | from your MySQL provider |
| Backend | `DB_SSL` | `true` if the provider requires TLS |
| Backend | `JWT_SECRET` | new long random value (never the dev one) |
| Backend | `CORS_ORIGIN` | your frontend URL, e.g. `https://<app>.vercel.app` |
| Frontend (build time) | `VITE_API_URL` | `https://<your-api-host>/api/v1` (public value only) |

## 3. Suggested topology (any equivalents work)
1. **MySQL 8 database** from a provider offering a free or student MySQL tier (verify it is MySQL-compatible and note any inactivity/size limits). Create the schema and demo data by running, from your laptop with the provider's connection details in a temporary `.env`: `npm run db:init` then `npm run db:seed`. **Change `SEED_ADMIN_PASSWORD` first and never reuse your dev password.**
2. **Backend** on a Node web-service host (root directory `backend`, build `npm install`, start `npm start`). Free instances often sleep when idle, so the first request can be slow.
3. **Frontend** on a static host (root `frontend`, build `npm run build`, output `dist`). SPA routing files are included: `frontend/public/_redirects` (Netlify/Cloudflare style) and `frontend/vercel.json`.
4. Set `CORS_ORIGIN` on the backend to the final frontend URL, redeploy, and test login.

## 4. Post-deploy checklist
- [ ] `GET <api>/api/v1/health` returns ok
- [ ] Login works from the deployed frontend (no CORS error in the browser console)
- [ ] Refreshing `/products` does not 404 (SPA rewrite)
- [ ] Wrong password 401, no stack traces in error responses
- [ ] `.env` not in the GitHub repo; demo admin password changed
- [ ] Record your URLs in the report: **Frontend: [DEPLOYED URL]**, **API: [API URL]**

## 5. Local production-style run
```powershell
cd frontend; npm run build; npm run preview     # serves dist/ on http://localhost:4173
```
(`preview` has no proxy; set `VITE_API_URL=http://localhost:5000/api/v1` and `CORS_ORIGIN=http://localhost:4173` to try it.)
