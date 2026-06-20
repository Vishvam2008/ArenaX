# ArenaX Security & Vulnerability Audit Report

This report outlines the security measures, password handling, session controls, and threat mitigation strategies implemented in the ArenaX architecture.

---

## 1. Authentication Security

### Passwords Hashing
- Player and Administrator passwords are encrypted using `bcrypt` (rounds=12 in production, rounds=10 in development). 
- Salt is generated cryptographically using standard system entropy. Plaintext passwords are never logged, stored, or sent back in responses.

### Session Management
- **Short-Lived Access Tokens**: Signed JWT tokens stored in-memory on the client (expires in 15 minutes).
- **Long-Lived Refresh Tokens**: Signed JWT tokens set by the backend server in an `httpOnly`, `Secure` (production only), `sameSite: strict` cookie (expires in 7 days). This blocks XSS attacks from reading sessions.

### Role-Based Access Control (RBAC)
- Standard player accounts use `authenticateUser` middleware.
- Admin routes use `authenticateAdmin` which parses the token and rejects requests if `role` is not `admin` or `super_admin`.
- Super Admin routes (wallet adjustments, audit log inspection, APK uploading) require additional `requireSuperAdmin` middleware checking.

---

## 2. Threat Vector Mitigations

### 1. SQL Injection (SQLi)
- All database queries are fully parameterized. The `pg` library automatically escapes inputs. Concatenated query strings are banned.

### 2. Cross-Site Scripting (XSS)
- Strict Content Security Policy (CSP) headers are configured via `helmet.js`.
- All client HTML renderings of user inputs (like ticket titles, chat replies, settings) are escaped before inject (e.g. using helper `escapeHTML`).

### 3. Rate Limiting
- **General Limiter**: Blocks abuse (max 100 requests / 15 minutes per IP).
- **Auth Limiter**: Strict limits on login/register/forgot-password (max 10 requests / 15 minutes per IP) to prevent brute-force attacks.
- **Admin Limiter**: Limit admin operations (max 50 requests / 15 minutes).

### 4. Direct Object Reference (IDOR)
- Players can only fetch support tickets where `user_id = req.user.id`. 
- Wallet transfers, withdrawals, and updates always resolve the target user using `req.user.id` from the verified token payload.
