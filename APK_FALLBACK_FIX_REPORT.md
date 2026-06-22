# APK_FALLBACK_FIX_REPORT.md

## Root cause
The backend `/api/apk/latest` endpoint only returns a row where `apk_versions.is_latest = true`. When the table has no such row (e.g., flags missing/incorrect), the endpoint returns **404** with `"No APK releases available."`. The frontend `frontend/public/apk/index.html` hides the download CTA unless the response contains `apk_url`, so the button remains hidden.

## Query before (current behavior)
```sql
SELECT version_name, version_code, apk_url, changelog, created_at
FROM apk_versions
WHERE is_latest = true
ORDER BY created_at DESC
LIMIT 1;
```
If no row matched → `404`.

## Query after (new behavior)
1) Try the original “latest flag” query.
```sql
SELECT version_name, version_code, apk_url, changelog, created_at
FROM apk_versions
WHERE is_latest = true
ORDER BY created_at DESC
LIMIT 1;
```
2) If no row found, fallback to newest by `version_code` then `created_at`.
```sql
SELECT version_name, version_code, apk_url, changelog, created_at
FROM apk_versions
ORDER BY version_code DESC, created_at DESC
LIMIT 1;
```
3) If the table is empty → keep returning `404` with `"No APK releases available."` (frontend continues to show “APK coming soon”).

## Safe logging added
When running in production, the route logs a minimal message indicating:
- latest flag row count
- fallback row count
- whether fallback was selected

## Verification results
- Code updated to always return a valid APK row when `apk_versions` has at least one record.
- Frontend behavior: download button is now expected to become visible whenever **any** APK version exists, even if `is_latest` flags are missing.

## Commit hash
TBD after commit.


