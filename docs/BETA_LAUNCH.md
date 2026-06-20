# ArenaX Public Beta Launch Checklist

Use this checklist to verify that all systems are operational before launching the ArenaX public beta to gamers.

---

## 1. Database & Migrations Check
- [ ] Connect pgAdmin or Supabase Console and verify all 18 tables are successfully created.
- [ ] Verify `leaderboard_stats` materialized view exists.
- [ ] Confirm settings are initialized with standard values (`upi_id`, `min_deposit`, etc.).

## 2. Security Checks
- [ ] Ensure `NODE_ENV` is set to `production` in Render environment settings.
- [ ] Verify `CORS_ORIGIN` matches the exact deployed frontend Vercel URL.
- [ ] Test the user signup and login; ensure `refreshToken` cookie is set to `Secure` and `HttpOnly`.
- [ ] Attempt accessing `/api/admin/*` routes using a standard player token; verify they are blocked with a `403 Forbidden` response.

## 3. Financial & Payment Flow Verification
- [ ] Log in as player, navigate to **Wallet**, check if static QR code and UPI ID render.
- [ ] Submit a deposit with a test 12-digit UTR and screenshot.
- [ ] Log in as admin, check **Deposits**, verify the UTR is listed, check screenshot preview, and click **Approve**.
- [ ] Confirm player balance increases by the deposit amount.
- [ ] Submit a duplicate UTR; verify the system rejects it with a unique constraint violation error.

## 4. Tournament Operations Verification
- [ ] Admin: Create a tournament (Solo/Duo/Squad) scheduled for 30 minutes from now.
- [ ] Players: Join the tournament. Check if slots count increases.
- [ ] Wait for check-in window (automatically opens at T-60min via cron or manual status trigger).
- [ ] Player: Check-in.
- [ ] Admin: Set room details ID and Password.
- [ ] Player: Verify details appear on their match detail screen.
- [ ] Admin: Distribute results & rewards. Confirm player wallets credit correctly.
