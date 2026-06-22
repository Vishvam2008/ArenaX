# APK_LINK_AUDIT.md

## Evidence (exact href used by download action)
In `frontend/public/index.html`, the CTA link to the APK page is:
- `href="/public/apk/"`

In the APK page `frontend/public/apk/index.html`, the *actual APK binary download* link is **dynamic** and is set at runtime by backend response:
- JS calls: `api.get('/apk/latest')`
- If the response contains `apk.apk_url`, then it sets: `$('downloadBtn').href = apk.apk_url`

## Missing files / paths in repo
- Under `frontend/public/apk/` there is only:
  - `index.html`
- There is **no** APK binary file committed in the repo.

## Root cause of 404 (as observed)
- The observed 404 happens on clicking the CTA that navigates to the APK page when Vercel routing does not correctly serve that nested static path.
- Additionally, even if the APK page loads, the binary download depends on backend endpoint `/apk/latest` returning a valid `apk.apk_url` (which would typically point to a hosted APK asset). No APK file is present in this repo to be downloaded directly.

## Current fix status
- `frontend/vercel.json` rewrites include:
  - `/apk/:path*` → `/public/apk/:path*`
  - and a catch-all fallback `/:path*` → `/public/index.html`

## Files modified in this APK-related patch
- `frontend/public/index.html` (minor CTA label/UX)
- `frontend/public/apk/index.html` (message when no active release)
- `APK_DOWNLOAD_FIX_REPORT.md` (report)

## Verification steps
1. Load homepage (`/`) and click APK CTA.
2. Confirm `/apk/` resolves (or `/public/apk/` resolves) without 404.
3. On the APK page, verify that when `/apk/latest` returns no active release, the page shows the “APK coming soon…” message and does not try to download a missing binary.

