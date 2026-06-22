# APK_DATA_STATUS.md

## Scope
Validate whether APK release data exists across:
1) `apk_versions` table (DB)
2) Supabase Storage bucket objects
3) Admin upload page availability

## What could be verified from repo code (no live DB/Supabase access in this environment)
### 1) `apk_versions` table
- Schema exists in `backend/migrations/015_create_apk_versions.sql`.
- The `/api/apk/latest` endpoint reads from `apk_versions`.
- The download button on `frontend/public/apk/index.html` is shown when the API returns an object containing `apk_url`.

**Live row count cannot be determined here** because this environment does not have working DB/Supabase connectivity details (see backend runtime failures like `getaddrinfo ENOTFOUND db.pvlszgkw...`).

### 2) Supabase storage bucket
- Upload workflow exists in `backend/src/modules/admin/admin.controller.js#uploadApk` and uses `storage.uploadFile()`.
- Storage file path is `releases/<uuid>.apk`.
- Download URL returned by backend is generated as a public URL:
  - `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${path}`

**Live bucket/object existence cannot be determined here** for the same reason: no Supabase network connectivity.

### 3) Admin upload page
- The admin APK management page exists at:
  - `frontend/public/admin/apk.html`
- It lists versions via `GET /admin/apk/versions`.
- It uploads via `POST /admin/apk/upload`.

## Current issue classification (most likely)
Based on observed frontend behavior in earlier investigation:
- `/api/apk/latest` returned **404 "No APK releases available."**
- That only occurs when backend query finds **no record** to return.

Given the code path, the failure is most consistent with:
- **Missing database record** (no row exists with `is_latest=true`, or the table is empty).
- After the fallback fix, the system should work as long as `apk_versions` contains *any* row.

## Final status summary
- apk_versions rows: **Unknown (not verifiable without live DB access)**
- Supabase storage objects: **Unknown (not verifiable without live Supabase access)**
- Admin upload page: **Present in repo and wired correctly**
- Most likely current issue: **Missing database record / missing latest record**


