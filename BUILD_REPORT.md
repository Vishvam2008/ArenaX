# ArenaX Build & Architecture Report

This report summarizes the architectural decisions, tech stack components, and database structure of the ArenaX mobile-first esports platform.

---

## 1. Technical Stack Summary

### Frontend (Player & Admin Panels)
- **HTML5 & CSS3**: Custom dark-themed layout built with Outfit (headings) and Inter (body) Google Fonts. Uses custom utility styling for glassmorphic cards and neon borders.
- **Vanilla ES Modules**: Native JS files (`api.js`, `auth.js`, `notifications.js`, `admin-core.js`) using ES6 classes and modular exports. No heavy frameworks (like React or Vue) to keep PWA load speeds under 1.5 seconds.
- **PWA Capabilities**: Service worker caching and manifest metadata configured for fullscreen mobile operation.

### Backend REST API
- **Node.js & Express**: Structured routing logic divided by feature modules (auth, users, wallet, payments, tournaments, etc.).
- **pg (node-postgres)**: Core database adapter configured with transaction pool connection limits and automatic client release hooks.

### Database & Storage
- **Supabase PostgreSQL**: Managed database instance leveraging SQL constraints, unique keys, and transactional safety.
- **Materialized View**: Uses `leaderboard_stats` materialized view for concurrent real-time rank lookups.
- **Supabase Storage (S3 REST)**: Stores avatars, APK releases, payment proof receipts, and match results screenshots.

---

## 2. Key Implementation Details

### Prevent Race Conditions in Tournament Registration
To prevent duplicate slot allocations or overbooking slots when multiple users join in the exact same millisecond:
1. Opens a database transaction block (`BEGIN`).
2. Acquires an exclusive row-level lock on the specific tournament using `SELECT filled_slots, total_slots FROM tournaments WHERE id = $1 FOR UPDATE`.
3. Validates slot availability inside the lock.
4. Allocates the next slot: `SELECT COALESCE(MAX(slot_number), 0) + 1 FROM participants WHERE tournament_id = $1`.
5. Inserts participant and increments `filled_slots`.
6. Commits transaction (`COMMIT`), releasing the lock.

### Payment Deduplication & Fraud Control
- Every deposit submission checks the 12-digit transaction UTR number against a unique key constraint in the database.
- Screenshot files are SHA256 hashed before upload. The hash is saved in `payment_requests.screenshot_hash`. If a player submits a receipt screenshot that was already uploaded by someone else, the request is immediately blocked.
