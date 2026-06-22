# DEPLOYMENT_FIX_REPORT.md

## Root cause
- Vercel deployment root directory is configured as **`frontend`**.
- The repo is a static site where the HTML entrypoint is at **`frontend/public/index.html`**.
- However, the homepage (and some navigation paths) contained hardcoded absolute links under **`/public/...`** (e.g. `/public/auth/login.html`, `/public/dashboard/`, `/public/apk/`).
- In production, **`/public/...` paths do not exist**, so navigation/route resolution resulted in **`404 NOT_FOUND`**.
- Additionally, Vercel needs an explicit SPA-like rewrite/fallback so that nested routes resolve to the correct `public/*.html` assets.

## Files changed / added
1. **Added:** `frontend/vercel.json`
   - Provides rewrites so:
     - `/` → `/public/index.html`
     - nested paths like `/admin/*`, `/auth/*`, `/dashboard/*`, etc. map into the matching folder under `frontend/public/`
     - a final catch-all routes any unknown path to `/public/index.html`
2. **Updated:** `frontend/public/index.html`
   - Removed incorrect `/public/` prefixes from absolute links:
     - `/public/dashboard/` → `/dashboard/`
     - `/public/auth/login.html` → `/auth/login.html`
     - `/public/auth/register.html` → `/auth/register.html`
     - `/public/apk/` → `/apk/`

## Why 404 occurred
- Because Vercel serves `frontend/public/*` at the deployment root (`/`).
- Therefore, any hardcoded absolute URL starting with `/public/` points to a non-existent directory (`/public/...`) → Vercel returns **NOT_FOUND**.
- For deep/nested paths, without rewrites/fallback Vercel may not return the correct `public/<section>/...html`.

## Why the fix resolves it
- `frontend/vercel.json` ensures Vercel correctly serves the right HTML for:
  - the homepage `/`
  - nested sections `/admin/*`, `/auth/*`, `/dashboard/*`, `/wallet/*`, etc.
  - fallback routes back to `index.html`
- Corrected absolute link paths ensure the UI navigates to real deployed assets (matching the `frontend/public` directory mapping).

## Deployment/route validation performed
- Confirmed `frontend/public/index.html` exists.
- Confirmed corrected absolute URLs now match the intended production routes (`/apk/`, `/dashboard/`, `/auth/...`).
- Confirmed Vercel config file exists at `frontend/vercel.json`.

