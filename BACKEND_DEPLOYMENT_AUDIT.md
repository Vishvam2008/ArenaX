# BACKEND_DEPLOYMENT_AUDIT.md

## 1) Current production architecture
- Frontend is deployed as a Vercel static site from the `frontend/` directory.
- Backend is an Express API located in `backend/`.

## 2) How backend is intended to be deployed
Per `DEPLOYMENT_GUIDE.md`:
- Backend API deployment is intended for **Render.com** as a Node Web Service.
- Steps include: choose `backend/` as root folder, build `npm install`, start `npm start`, and set env vars from `backend/.env.example`.

## 3) Backend has its own package.json
Yes.
- `backend/package.json` exists and contains scripts:
  - `start`: `node src/server.js`
  - `dev`: `nodemon src/server.js`
  - `migrate`: `node src/config/migrate.js`
  - `seed`: `node src/config/seed.js`

## 4) API base URL frontend currently uses
`frontend/assets/js/api.js`:
```js
const API_BASE = window.ARENAX_API_URL || 'http://localhost:5000/api';
```
So unless the Vercel deployment provides `window.ARENAX_API_URL` (via injected script / env), the frontend will default to `http://localhost:5000/api`.

Also, in `frontend/public/apk/index.html`, the page calls:
- `api.get('/apk/latest')`
which becomes `${API_BASE}/apk/latest`.

## 5) Why Vercel returns 404 at `/api/apk/latest`
Your production check was against:
- `https://arena-x-git-main-vishvam2008s-projects.vercel.app/api/apk/latest`

In this repo, Vercel is configured only for static frontend routes via `frontend/vercel.json` rewrites.
- There is **no serverless function** or Vercel backend configuration in this repo to mount Express routes under `/api/*`.

Therefore:
- `/api/apk/latest` on Vercel hits the static site router.
- Since no static asset exists at that path, Vercel responds **404 NOT_FOUND**.

## 6) Actual backend URL
Not determinable from repo alone.
- The intended pattern is: Render domain (e.g. `https://arenax-backend.onrender.com/api`) injected via `window.ARENAX_API_URL`.
- The repository does not contain a committed value for `window.ARENAX_API_URL`.

## 7) Missing deployment step (most likely)
One of the following is missing/misconfigured:
1. Backend is not deployed (Render/Railway/VPS not created), OR
2. Frontend is not pointed at the deployed backend URL (`window.ARENAX_API_URL` not set in Vercel env), OR
3. Backend deployed but wrong path (/api not routed).

Your observation that `https://.../api/apk/latest` returns 404 confirms that the backend is not mounted on Vercel at that path.

## 8) Exact fix to apply (repository change)
Given the repo is configured as a static Vercel app, the correct fix is to connect the frontend to the real backend URL via `window.ARENAX_API_URL`.

Because we cannot determine the real Render/Railway URL from repo files, the repository cannot safely hardcode an unknown production backend URL.

So the fix should be applied in deployment settings:
- Deploy backend to Render (as per `DEPLOYMENT_GUIDE.md`), then set `window.ARENAX_API_URL` in Vercel to the backend base, e.g.:
  - `https://<render-backend-host>/api`

No unrelated code modifications are required.

## What I did in this repo
- No code changes were made (audit only).

