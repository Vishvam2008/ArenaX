# VERCEL_API_SETUP.md

This guide documents how to configure the ArenaX frontend (deployed on Vercel) so it can reach the backend API.

## Why it’s needed
The frontend API client uses:

```js
const API_BASE = window.ARENAX_API_URL || 'http://localhost:5000/api';
```

So in production, you **must** provide `window.ARENAX_API_URL` via Vercel environment variables or the frontend will call `http://localhost:5000/api`.

## What to set on Vercel
In your Vercel project for `frontend/`:

1. Vercel Dashboard → Project → **Settings**
2. **Environment Variables**
3. Add:
   - **Key**: `window.ARENAX_API_URL`
   - **Value**: `https://<your-render-host>/api`
   - **Install/Build**: `No` (runtime is enough for static HTML)
   - **Environment**: `Production`

Example:
- Render backend host: `https://arenax-backend.onrender.com`
- Value to set: `https://arenax-backend.onrender.com/api`

## Confirm in browser
1. Load:
   - `https://<your-vercel-domain>/apk/`
2. In DevTools Console/Network:
   - ensure request goes to:
     - `https://<render-host>/api/apk/latest`
3. Expected behavior:
   - if backend has `apk_versions` data → download button appears
   - otherwise → “APK coming soon…”


