# Deleting, Deploying, and Seeding ArenaX

This quick reference guide outlines the commands and keys needed to launch ArenaX.

---

## 1. Quick Local Boot
To run ArenaX backend locally:
```bash
cd backend
# 1. Install dependencies
npm install
# 2. Run migrations
npm run migrate
# 3. Seed Super Admin
npm run seed
# 4. Boot development server
npm run dev
```

To run ArenaX frontend locally:
```bash
cd frontend
# Run using static local server (e.g. Live Server or serve)
npx serve public
```

---

## 2. Supabase Storage Public Policy
Ensure your Supabase bucket `arenax-uploads` has a public policy matching the following parameters:
- **Allowed operations**: `SELECT`, `INSERT`, `UPDATE`
- **Policy formula**:
  ```sql
  (bucket_id = 'arenax-uploads'::text)
  ```

---

## 3. Environment Config Keys Summary
Ensure your production environment variables contains the following keys:
- `DATABASE_URL`: Connection string.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: Secure strings.
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`: API access.
- `SUPABASE_STORAGE_BUCKET`: Bucket name.
- `CORS_ORIGIN`: Deployed Vercel domain.
