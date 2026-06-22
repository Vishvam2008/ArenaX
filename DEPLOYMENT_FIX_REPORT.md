# DEPLOYMENT_FIX_REPORT.md

## Root cause
1. **Vercel routing served 404 for “/”** even though `frontend/public/index.html` exists.
2. The code also had **hardcoded absolute links to `/public/...`** (e.g. `/public/auth/login.html`, `/public/dashboard/`, `/public/apk/`).
   - Since Vercel deployment root is `frontend`, the folder `frontend/public` is mapped to `/`.
   - Therefore, paths like `/public/auth/login.html` do **not** exist in production → `404 NOT_FOUND`.

## Why 404 occurred (detail)
- Deployment root directory on Vercel is **`frontend`**.
- That means the correct production paths are:
  - `frontend/public/index.html` → `/`
  - `frontend/public/apk/index.html` → `/apk/`
  - `frontend/public/auth/login.html` → `/auth/login.html`
- Without proper Vercel configuration, Vercel doesn’t always correctly fall back to `index.html` for `/` and nested routes.
- Additionally, the UI was generating non-existent `/public/*` URLs.

## Fix summary
### 1) Added Vercel static rewrite configuration
- **File added:** `frontend/vercel.json`
- Added rewrites so:
  - `GET /` serves `frontend/public/index.html`
  - Nested paths like `/admin/...`, `/auth/...`, `/dashboard/...`, etc. map into `frontend/public/<section>/...`
  - SPA-like fallback routes return `/public/index.html`

### 2) Corrected broken absolute links inside homepage
- **File updated:** `frontend/public/index.html`
- Removed incorrect `/public/` prefixes from absolute URLs:
  - `/public/dashboard/` → `/dashboard/`
  - `/public/auth/login.html` → `/auth/login.html`
  - `/public/auth/register.html` → `/auth/register.html`
  - `/public/apk/` → `/apk/`

## Files changed/added
- **Added:** `frontend/vercel.json`
- **Changed:** `frontend/public/index.html`

## Why the fix resolves it
- `frontend/vercel.json` ensures Vercel serves the correct entrypoint (`/public/index.html`) for `/` and supports deep links to nested static pages.
- Corrected absolute paths ensure the UI navigates to real deployed files (mapped from `frontend/public/*` to `/ *`) rather than non-existent `/public/*` routes.

## Validation checklist performed
- Confirmed `frontend/public/index.html` now uses correct production paths (`/apk/`, `/dashboard/`, `/auth/...`).
- Confirmed `frontend/public/index.html` exists.
- Confirmed Vercel config exists at `frontend/vercel.json`.

