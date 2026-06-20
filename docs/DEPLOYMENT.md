# ArenaX Deployment Guide

This document describes how to deploy the frontend PWA and backend Express API of ArenaX to production.

---

## 1. Supabase (Database & Storage)

### Database Setup
1. Create a new project in the Supabase Dashboard.
2. Go to **Project Settings > Database** and copy the **Connection string (URI)**.
3. Replace `[YOUR-PASSWORD]` with your actual database password and ensure you append `?sslmode=require` to the string.
4. Run the database migrations locally to set up schemas:
   ```bash
   cd backend
   npm run migrate
   ```
5. Seed the initial Super Admin account:
   ```bash
   npm run seed
   ```

### Storage Setup
1. Go to the Supabase Dashboard and select **Storage**.
2. Create a new bucket named **`arenax-uploads`**.
3. Make sure the bucket policy is set to **Public** so uploaded files (avatars, game screenshot proofs, QR codes, APK binaries) are retrievable by public URLs.

---

## 2. Backend API Deployment (Render.com)

1. Sign in to [Render.com](https://render.com) and click **New > Web Service**.
2. Connect your repository and select the **`backend`** directory as the root folder.
3. Configure the build environment:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add all environment variables from `backend/.env.example` to Render's **Environment Settings**:
   - `NODE_ENV`: `production`
   - `PORT`: `5000`
   - `DATABASE_URL`: *(Your Supabase Connection URI)*
   - `JWT_ACCESS_SECRET`: *(Strong 64-char random string)*
   - `JWT_REFRESH_SECRET`: *(Different strong 64-char random string)*
   - `SUPABASE_URL`: *(Supabase project URL)*
   - `SUPABASE_SERVICE_KEY`: *(Supabase secret service key)*
   - `SUPABASE_STORAGE_BUCKET`: `arenax-uploads`
   - `CORS_ORIGIN`: `https://your-frontend-vercel-domain.vercel.app`
   - `BCRYPT_ROUNDS`: `12`
   - `RATE_LIMIT_WINDOW_MS`: `900000`
   - `RATE_LIMIT_MAX`: `100`

---

## 3. Frontend PWA Deployment (Vercel)

1. Sign in to [Vercel](https://vercel.com) and click **Add New > Project**.
2. Import your repository and select the **`frontend`** directory as the root folder.
3. Keep default settings (Vercel auto-detects HTML/CSS/JS static structure).
4. Add the API base URL target in **Vercel System Env Settings**:
   - Create a file/key called `window.ARENAX_API_URL` pointing to your Render.com domain (e.g. `https://arenax-backend.onrender.com/api`).
5. Click **Deploy**.
