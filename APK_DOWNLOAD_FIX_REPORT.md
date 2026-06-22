# APK_DOWNLOAD_FIX_REPORT.md

## Root cause
- The homepage CTA links to `/public/apk/`.
- The APK page (`frontend/public/apk/index.html`) dynamically calls `GET /apk/latest` via `api.get('/apk/latest')` and then sets the download button to `apk.apk_url`.
- The repository contains **no actual APK binary file** under `frontend/public/apk/` (only `index.html` exists).
- Therefore, when the backend release is missing/unavailable (or `apk.apk_url` points to a non-existent asset), the download action ultimately results in **404 NOT_FOUND** on Vercel.

## Files modified
- `frontend/public/index.html`
  - Minor label update: "Download ArenaX Android App (APK)" (CTA still routes to the APK info page).
- `frontend/public/apk/index.html`
  - Tweaked UI text so the page clearly indicates APK is coming soon when no release is available.
  - Added `rel="noopener noreferrer"` on the download button anchor.

## Final download URL
- The final download URL remains **dynamic** and is provided by the backend response:
  - `apk.apk_url` from `GET /apk/latest`

## Verification steps (what to test on Vercel)
1. Load homepage: `GET /` and click **Download ArenaX Android App (APK)**.
2. Ensure `/public/apk/` (or `/apk/`) loads the APK page successfully (no 404).
3. On the APK page, confirm:
   - If `/apk/latest` returns no active release, the UI shows **“APK coming soon. Please use the PWA directly for now.”**
   - The download button remains hidden (no broken binary link).
4. Confirm static assets under `/assets/*` load with no NOT_FOUND.

## Notes
- This fix prevents UX from pointing to a non-existent binary inside the repo.
- To enable real APK downloads, a valid `apk.apk_url` must be returned by the backend and point to a real hosted APK asset (e.g., Supabase Storage / S3 / public static file).
