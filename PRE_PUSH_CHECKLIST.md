# PRE_PUSH_CHECKLIST

This checklist summarizes the repository state after cleanup and before manual push.

## A) Packaging / scripts
- [x] `backend/package.json` contains `start`, `dev`, `migrate`, and `seed` scripts.
- [x] `frontend/package.json` exists with a static start command.
- [x] `vercel.json` exists and validates as JSON.

## B) Backend startup & routing
- [x] `backend/src/server.js` is present and initializes the HTTP server.
- [x] `backend/src/app.js` configures Helmet, CORS, JSON/urlencoded parsers, `/health`, rate limiting on `/api`, module routers, 404 handler, and error handler.

## C) Frontend startup
- [x] `frontend/package.json` is present and defines `npx http-server -p 3000`.
- [ ] Production build workflow not fully validated in this sandbox.

## D) Migration / seed ordering
- [x] `backend/src/config/migrate.js` executes SQL files sorted lexicographically and tracks them in `migrations_log`.
- [x] `backend/src/config/seed.js` seeds admin, users, wallets, tournaments, payment requests, results, and notifications.
- [ ] Full seed coverage and runtime table dependencies not verified without a live database.

## E) Repository cleanup
- [x] `.gitignore` updated to ignore `.env`, temp fixture files, and debug artifacts.
- [x] `backend/.env` is not tracked by git.
- [x] Duplicate migration file `backend/migrations/019_seed_default_settings.sql` removed.
- [x] Stale generated reports and debug artifacts removed from the repository tree.

## F) Secrets and environment safety
- [x] `.env` is ignored via `.gitignore`.
- [ ] Actual `.env` contents were not checked in this environment.

## G) Deployment readiness
- [ ] `vercel.json` contains a placeholder backend endpoint that must be replaced before deployment.
- [ ] Manual verification required for database connectivity, live backend URL, and Vercel environment configuration.

## H) Manual actions before push
- Replace `YOUR_BACKEND_URL` in `vercel.json` with the real backend production URL.
- Configure `window.ARENAX_API_URL` or equivalent runtime override for frontend production.
- Confirm `backend/.env` is only present locally and not committed.
- Run local `npm install` and `npm run migrate`/`npm run seed` in the target deployment environment.

