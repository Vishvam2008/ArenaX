# DEPLOYMENT_FIX_REPORT.md

## Root cause (why Vercel returned 404)
- Root directory on Vercel is set to **frontend**.
- The site’s entry file exists at **frontend/public/index.html**.
- Without a Vercel static routing config, Vercel does not automatically map the site root path **/** to **/public/index.html** when the repository is organized as `public/` under the chosen root.
- As a result, requests to **/** (and SPA-like nested paths) were not being served the entry HTML, leading to **404 NOT_FOUND**.

## What I changed (files changed)
1. **Added** `frontend/vercel.json`
   - Creates explicit rewrites so that:
     - `GET /` → `/public/index.html`
     - Common nested routes (`/admin/*`, `/auth/*`, `/dashboard/*`, `/leaderboard/*`, `/profile/*`, `/teams/*`, `/tickets/*`, `/tournaments/*`, `/wallet/*`, `/apk/*`) map to the corresponding file trees under `/public`.
     - Any other unmatched route `GET /:path*` falls back to `/public/index.html`.

## Why the fix resolves the 404
- The rewrite `{"source": "/", "destination": "/public/index.html"}` guarantees the homepage loads from the existing `frontend/public/index.html`.
- The catch-all fallback `{"source": "/:path*", "destination": "/public/index.html"}` ensures Vercel serves `index.html` for SPA-style / deep-link paths instead of returning NOT_FOUND.
- Additional explicit rewrites for known directories keep deep links consistent with the static file layout.

## Deployment notes
- Root directory remains **frontend**.
- No build/output directory assumptions were added because the project is a static frontend using files directly from `public/`.

