# RENDER_DEPLOYMENT_GUIDE.md

This guide documents how to deploy the ArenaX backend (Express API) to **Render.com**.

## Backend location
- Directory: `backend/`
- Entry: `backend/src/server.js`

## Prerequisites
- A Supabase project with:
  - Postgres DB (connection string)
  - Storage bucket named: `arenax-uploads`
  - Public access for uploaded assets (at least `SELECT` for public URLs; see policies in `DEPLOYMENT_GUIDE.md`).

## 1) Create Render service
1. Render → **New** → **Web Service**
2. Connect Git repository
3. Select **Root Directory**: `backend`

## 2) Configure Build
- Environment: **Node**
- Build Command: `npm install`
- Start Command: `npm start`

> If you want to run migrations on deploy, do it manually first (Render build/start may not run `npm run migrate` automatically).

## 3) Environment variables (Render → Environment Settings)
Set exactly what’s required by `backend/src/config/env.js`.

**Required (server will refuse to start if any are missing):**
- `NODE_ENV` = `production`
- `PORT` = `5000`
- `DATABASE_URL` = *(Supabase Postgres connection URI; include `sslmode=require` if needed)*
- `JWT_ACCESS_SECRET` = *(random strong string)*
- `JWT_REFRESH_SECRET` = *(random strong string)*
- `JWT_ACCESS_EXPIRES` = *(e.g. `15m`)*
- `JWT_REFRESH_EXPIRES` = *(e.g. `7d`)*
- `SUPABASE_URL` = *(Supabase project URL)*
- `SUPABASE_SERVICE_KEY` = *(Supabase service role key)*
- `SUPABASE_STORAGE_BUCKET` = `arenax-uploads`
- `BCRYPT_ROUNDS` = `12` (or your choice)
- `CORS_ORIGIN` = `https://<your-vercel-domain>`

Optional defaults used if omitted:
- `RATE_LIMIT_WINDOW_MS` (default `900000`)
- `RATE_LIMIT_MAX` (default `100`)

## 4) Migrations & seed
Run these once before production traffic:
```bash
cd backend
npm install
npm run migrate
npm run seed
```

This creates:
- `apk_versions` table (`015_create_apk_versions.sql`)
- admin user(s) required for `/admin/apk/upload`

## 5) Health check / verification
Backend is expected to expose:
- `GET /health` → `{ status: "ok" }`
- `GET /api/apk/latest` →
  - `200` with JSON if at least one record exists in `apk_versions` (with `is_latest=true` or fallback logic)
  - `404` if no rows exist

After deploy, confirm:
- `GET https://<your-render-host>/health`
- `GET https://<your-render-host>/api/apk/latest`

## 6) Enable frontend to talk to backend
In Vercel, configure `window.ARENAX_API_URL` (see `VERCEL_API_SETUP.md`).


