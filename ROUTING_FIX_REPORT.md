# ROUTING_FIX_REPORT.md

## Files modified
1. `frontend/public/index.html`
   - `href="/public/apk/"` → `href="/apk/"`
   - `href="/public/dashboard/"` → `href="/dashboard/"` (inside session-dependent CTA)
   - `href="/public/auth/login.html"` → `href="/auth/login.html"`
   - `href="/public/auth/register.html"` → `href="/auth/register.html"`

## Old vs New paths (key changes)
- `/public/apk/` → `/apk/`
- `/public/dashboard/` → `/dashboard/`
- `/public/auth/login.html` → `/auth/login.html`
- `/public/auth/register.html` → `/auth/register.html`

## Why the fix resolved the deployment 404s
- On Vercel, the configured root directory is `frontend`.
- Therefore, `frontend/public/*` is already served at the deployment root. Hardcoded `/public/*` URLs incorrectly point to a non-existent `/public` folder, causing Vercel `404 NOT_FOUND`.
- Switching links to `/apk/*`, `/dashboard/*`, and `/auth/*` matches the actual deployed static file locations.

## Verification results (what was checked)
- Confirmed `frontend/public/index.html` now links to `/apk/` for the APK CTA.
- Confirmed the session-dependent links no longer contain `/public/` prefixes.

## Notes
- Deep-link routing for nested pages is handled via `frontend/vercel.json` rewrites (added previously), so these corrected absolute paths should resolve without 404.

