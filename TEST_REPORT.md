# ArenaX Verification & Testing Report

This report documents the verification plan, testing procedures, and manual verification lifecycles executed to validate the ArenaX gaming platform.

---

## 1. Database Migrations Audit

A fresh database setup was verified by running the chronological migrations sequence:
```bash
cd backend
npm run migrate
```
**Results**:
- 18 schema files completed successfully with no constraint compilation errors.
- Primary and foreign key configurations validated.
- Materialized view `leaderboard_stats` initialized correctly.
- Settings seeded: `upi_id`, platform name, wallet minimums and maximums.

---

## 2. Core Functional Verification Lifecycles

### 1. User Signup & Wallet Creation
- **Action**: Submitted registration via `/api/auth/register`.
- **Validation**: User record created, password salted. A corresponding empty wallet row is automatically created in `wallets` table via transaction with starting balance of `0.00`.

### 2. Manual Deposit Approval Flow
- **Action**: Logged in as player, submitted deposit request with UTR `602312345678` and proof image.
- **Validation**:
  - Image uploaded successfully to Supabase bucket.
  - Receipt image checksum SHA256 hashed and matched: successfully blocks submitting a duplicate UTR or same screenshot.
- **Action**: Logged in as Super Admin, accessed payments queue, clicked "Approve".
- **Validation**:
  - Wallet balance updated atomically using row lock (`SELECT FOR UPDATE`).
  - Transaction logged under category `deposit` with balance before/after.
  - In-app notification delivered to the player's inbox.

### 3. Tournament Join & Room Releaser
- **Action**: Created squad tournament, registered a squad team, team captain joins tournament.
- **Validation**:
  - Slot numbers assigned automatically.
  - Registration fees deducted from wallet.
  - Double join blocked.
- **Action**: Admin releases Room ID `998877` and Password `1234` when check-in opens.
- **Validation**: Lobby details successfully visible on the player's match detail page.

### 4. Support Desk Ticket Chat
- **Action**: Player opens ticket, submits attachment. Admin views ticket inside control panel, posts reply.
- **Validation**: Real-time replies append to the timeline with correct sender tags.
