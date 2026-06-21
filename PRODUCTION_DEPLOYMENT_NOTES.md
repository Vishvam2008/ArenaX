# PRODUCTION_DEPLOYMENT_NOTES

## Vercel deployment notes
- `vercel.json` is included and currently routes the frontend statically.
- The API rewrite currently points to `https://YOUR_BACKEND_URL/api/$1` and must be replaced with the actual backend URL before deployment.
- The frontend root is served from `frontend/index.html` and `/public/*` static assets.

## Frontend production API configuration
- The frontend default API base is `window.ARENAX_API_URL || 'http://localhost:5000/api'`.
- For production, set `window.ARENAX_API_URL` in the deployment environment or page script to the deployed backend API base.

## Backend environment requirements
- `backend/src/config/env.js` requires environment variables including `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET`, and CORS origin.
- `.env.example` contains placeholder values and should be copied to a local `.env` file only on development hosts.
- `.env` is ignored by `.gitignore` and must not be committed.

## Database/data deployment notes
- `backend/src/config/migrate.js` runs migrations in lexical order and records applied files in `migrations_log`.
- `backend/src/config/seed.js` seeds admins, users, wallets, tournaments, payment requests, results, and notifications after truncating tables.
- Local DB validation could not be completed because PostgreSQL at `127.0.0.1:5432` was not available in this environment.

## Storage configuration
- `backend/src/config/storage.js` uses a dummy Supabase fallback URL when `SUPABASE_URL` indicates a local/offline environment.
- Production must use real Supabase credentials and a valid bucket.

## Manual deployment checks
- Replace placeholder backend URL in `vercel.json`.
- Confirm `window.ARENAX_API_URL` is set correctly in production.
- Verify `backend/src/config/storage.js` points to real Supabase values and not dummy placeholders.
- Ensure database migrations are applied and seed data is loaded before backend startup.

