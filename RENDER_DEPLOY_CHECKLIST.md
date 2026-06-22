# RENDER_DEPLOY_CHECKLIST.md

This checklist is the exact step-by-step to deploy the ArenaX backend to **Render.com** and verify the APK endpoints.

## Backend location / source
- Root directory: `backend/`
- Entry file: `backend/src/server.js`
- Health endpoint (in code): `GET /health`
- APK endpoint (in code): `GET /api/apk/latest`

## 1) Confirm backend/package.json scripts
`backend/package.json` must include:
- Build/start runtime:
  - Build command (Render): `npm install`
  - Start command (Render): `npm start`
- Migration/seed (run once manually before traffic):
  - `npm run migrate`
  - `npm run seed`

## 2) Render Web Service settings
### Create service
- Render → **New** → **Web Service**
- Connect repo
- **Root Directory**: `backend`

### Configure build
- Environment: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

## 3) Required Render environment variables
These are required by `backend/src/config/env.js` (server exits if any are missing).

Set exactly:
- `NODE_ENV=production`
- `PORT=5000`
- `DATABASE_URL=<Supabase Postgres connection URI; include sslmode=require if required>`
- `JWT_ACCESS_SECRET=<strong random string>`
- `JWT_REFRESH_SECRET=<strong random string>`
- `JWT_ACCESS_EXPIRES=<e.g. 15m>`
- `JWT_REFRESH_EXPIRES=<e.g. 7d>`
- `SUPABASE_URL=<https://<project-ref>.supabase.co>`
- `SUPABASE_SERVICE_KEY=<Supabase service role key>`
- `SUPABASE_STORAGE_BUCKET=arenax-uploads`
- `BCRYPT_ROUNDS=12`
- `CORS_ORIGIN=https://<your-vercel-domain>`

Optional (defaults exist in code):
- `RATE_LIMIT_WINDOW_MS` (default `900000`)
- `RATE_LIMIT_MAX` (default `100`)

## 4) Migrations & seed (run once)
Before exposing to traffic, run:
```bash
cd backend
npm install
npm run migrate
npm run seed
```

**Why:**
- `/api/apk/latest` reads `apk_versions`
- Admin upload route requires an admin in `admins`

## 5) Health check after deploy
After Render deploy completes, note the Render service URL, e.g.:
- `https://<render-service-name>.onrender.com`

Verify:
1. `GET https://<render-host>/health`
   - Expected: `{ "status": "ok" }`
2. `GET https://<render-host>/api/apk/latest`
   - Expected:
     - `200` if at least one apk record exists and fallback/`is_latest` resolves
     - `404` with message `No APK releases available.` if DB table is empty


## 6) Frontend connection (Vercel environment)
On Vercel, set:
- `window.ARENAX_API_URL=https://<render-host>/api`

The frontend uses:
- `frontend/assets/js/api.js` → `API_BASE = window.ARENAX_API_URL || 'http://localhost:5000/api'`

## 7) Final verification
- Visit `https://<vercel-domain>/apk/`
- Confirm Network calls:
  - `GET https://<render-host>/api/apk/latest`
- Confirm download button appears when backend returns an `apk_url`.

