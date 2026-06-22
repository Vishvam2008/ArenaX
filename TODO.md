# TODO (APK download fix + verification)

## Step 1: Verify routing and backend response contract
- [x] Confirm `frontend/public/apk/index.html` calls `GET /apk/latest` and only shows download button when response contains `apk_url`.
- [x] Confirm backend route `backend/src/modules/apk/apk.routes.js` exposes `GET /latest` under `/api/apk`.
- [ ] Confirm API base URL used by frontend (`/api` prefix) on Vercel.

## Step 2: Verify DB + latest selection logic
- [x] Confirm `/api/apk/latest` selects from `apk_versions` where `is_latest = true`.
- [ ] Ensure at least one row exists with `is_latest=true`.

## Step 3: Verify Supabase storage workflow
- [x] Confirm admin upload writes `releases/<uuid>.apk`.
- [x] Confirm upload returns a public URL using `/storage/v1/object/public/...`.
- [ ] Verify Supabase bucket exists and objects are public.

## Step 4: Fix the issue
- [ ] If `apk_versions` has no `is_latest=true`, add a fallback in backend to return most recent row even if `is_latest` flags are missing.
- [ ] If frontend expects `apk_url` but backend returns `{data: ...}`, ensure frontend handles it correctly.
- [ ] Add minimal logging/diagnostics in `/api/apk/latest` response for debugging (prod-safe).

## Step 5: Test the fix
- [ ] Run backend locally and hit `/api/apk/latest`.
- [ ] Load `frontend/public/apk/index.html` and verify the download button appears.

## Step 6: Release
- [ ] Commit all changes.
- [ ] Push to `main`.

