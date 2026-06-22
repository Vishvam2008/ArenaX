# PRODUCTION_API_FIX_REPORT.md

## Summary
Production 404 on `/<vercel-domain>/api/apk/latest` happens because:
- Vercel is configured to serve the **static frontend** only.
- There is no backend mounted under `/api/*` on Vercel.
- The frontend must be configured to call the separately deployed backend (Render).

## Current production architecture
- Frontend: Vercel static site from `frontend/`
- Backend: Express API intended for **Render** (per `docs/DEPLOYMENT.md` and `DEPLOYMENT_GUIDE.md`)

## Backend URL
- Expected backend base URL is injected into the frontend as:
  - `window.ARENAX_API_URL = https://<render-host>/api`
- Frontend then calls:
  - `GET <ARENAx_API_URL>/apk/latest`

## Frontend API configuration (source of truth)
File: `frontend/assets/js/api.js`
```js
const API_BASE = window.ARENAX_API_URL || 'http://localhost:5000/api';
```

## Missing production deployment/config step
- Backend is not deployed to (or not reachable at) the URL that Vercel frontends expect.
- Additionally, `window.ARENAX_API_URL` is not set (or not set correctly) in Vercel env vars.

## Exact fix applied in this repo
No runtime code was changed.
Added production-safe documentation:
1. `RENDER_DEPLOYMENT_GUIDE.md`
   - exact Render build/start commands
   - required environment variables
   - migration + seed steps
   - verification endpoints (`/health`, `/api/apk/latest`)
2. `VERCEL_API_SETUP.md`
   - exact Vercel Environment Variable to set
   - value format: `https://<render-host>/api`
3. `BACKEND_DEPLOYMENT_AUDIT.md` (existing from prior step)
   - explains why `/api/apk/latest` returns 404 on Vercel

## How to verify after you apply the fixes
1. Deploy backend to Render.
2. Confirm:
   - `GET https://<render-host>/health` returns `{status:"ok"}`
   - `GET https://<render-host>/api/apk/latest` returns `200` (or `404` with “No APK releases available.” if DB empty)
3. Set in Vercel env:
   - `window.ARENAX_API_URL = https://<render-host>/api`
4. Confirm in browser:
   - `GET https://<vercel-domain>/apk/` loads and download CTA appears when backend returns a release.


