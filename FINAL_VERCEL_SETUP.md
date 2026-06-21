# FINAL_VERCEL_SETUP

## 1) Configure production backend URL
- In `vercel.json`, replace the placeholder `https://YOUR_BACKEND_URL/api/$1` with the deployed backend base URL.
- Example:
```json
{
  "src": "/api/(.*)",
  "dest": "https://api.arenax.example.com/api/$1"
}
```

## 2) Frontend API base configuration
- The frontend default API base is set using `window.ARENAX_API_URL || 'http://localhost:5000/api'`.
- Ensure that production pages set `window.ARENAX_API_URL` to the deployed backend API URL.
- If needed, inject this value via environment variables or a runtime script.

## 3) Vercel static routing and SPA configuration
- Current `vercel.json` routing:
  - `/` -> `/frontend/index.html`
  - `/public/*` -> `/frontend/public/*`
  - `/api/*` -> backend API proxy
- Ensure Vercel serves the repository root and that the frontend directory structure matches this configuration.

## 4) Vercel project settings
- Root directory: repository root
- Build command: none required for static files
- Output directory: not required when using `@vercel/static`
- Environment variables:
  - `ARENAX_API_URL` -> deployed backend API URL
  - Other production secrets if applicable

## 5) Deploying to Vercel
1. Create or select the Vercel project.
2. Add the project from the GitHub repository.
3. Ensure `vercel.json` is present in the root.
4. Deploy the frontend project.
5. Verify routes such as `/public/auth/login.html`, `/public/dashboard/`, and `/public/admin/login.html` work.

## 6) Post-deploy verification
- Confirm frontend loads without 404s.
- Confirm API calls target the correct production backend.
- Verify login, wallet, tournaments, and admin flows on production.

## 7) Preview deployments
- For previews, set `window.ARENAX_API_URL` to the preview backend URL.
- Use Vercel environment aliases or rewrites if required.
