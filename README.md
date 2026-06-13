# ArenaX — Mobile Esports Platform

ArenaX is a mobile-first esports prototype for running Clash/Squad Free Fire tournaments, manual wallet requests, verified room results, and admin-approved payouts. The frontend runs entirely as a static client-side web application, while a lightweight Node.js payment server manages screenshot verification.

---

## Features

- **Admin Gated Dashboard**: Hidden route (`#admin` / `#/admin`) protects the controls for QR configuration, payment reviews, tournament creation, checking in players, result validation, and risk profiles.
- **Robust Authentication**: Admin credentials are checked directly against the payment-server’s `/api/admins` using standard Basic Authentication. Bypasses are prevented via strict HTTP status checks on all admin API calls.
- **Synchronized Payment Verification**: Rejection/approval actions are coordinated directly with the backend. Screenshots are stored securely in folders (`Pending/`, `Approved/`, `Rejected/`) next to JSON metadata companions.
- **State Persistence**: Browser state (`state.wallet`, `state.ledger`, `state.audit`, `state.requests`, `state.tournaments`, `state.playerProfiles`, `state.recentWinners`, `state.qrConfig`) is persisted under a unified local storage key `ax_state` so that user progress, transaction audits, and custom lobby details survive refreshes.
- **Lobby-Wallet Payment Safety**: Approving a participant inside the lobby automatically debits their wallet entry fee. If client-side memory requests are cleared on reload, direct approvals fallback to checking balance limits and debits the wallet directly to block free entrances.
- **Audit Trails**: Every wallet adjustment, reward approval, fee deduction, and staff management operation creates a locked ledger entry and generates a secure audit code (e.g. `AUD-1001`).

---

## 1. Quick Start (Local Setup)

### Prerequisites
- Node.js (v14+ recommended)
- A modern web browser

### Step 1: Configure Environment
Rename `.env.example` to `.env` in the root folder:
```bash
cp .env.example .env
```
Inside `.env`, you can customize the configuration:
```env
ARENAX_PAYMENT_PORT=4400
ARENAX_PAYMENT_DIR=./Payments
ARENAX_PAYMENT_MAX_BODY_BYTES=5242880
```

### Step 2: Start the Payment Server
Run the payment backend:
```bash
node payment-server.js
```
The server will initialize, bootstrap the `Payments/Pending`, `Payments/Approved`, and `Payments/Rejected` directories, and output:
```
[INIT] Created directory: E:\ArenaX\Payments\Pending
[INIT] Created directory: E:\ArenaX\Payments\Approved
[INIT] Created directory: E:\ArenaX\Payments\Rejected
[INIT] Created default admin credentials file.

============================================================
  ArenaX Payment Server running on http://localhost:4400
============================================================
```

### Step 3: Run the Application
Simply open `index.html` directly in your web browser (or serve it with a local server like `live-server` or `python -m http.server`).

---

## 2. Default Test Accounts

### Admin Credentials (Payment Server / Dashboard Gating)
- **Username**: `admin`
- **Password**: `arenax2026`
- **Role**: `super` (Allows staff management: resetting passwords, toggling active status, and creating new admin accounts)

### Client Default User
- **User ID**: `USR102`
- **Name**: `RogueRavi`
- **Default Wallet**: `₹420` (Restored automatically unless mutated by approvals/debits)

---

## 3. Operations & Architecture

### File Structures
- `index.html` - Premium glassmorphism mobile views and modal overlays.
- `styles.css` - Dense mobile responsive layouts, shimmering skeleton loaders, and slide transitions.
- `app.js` - Global state structure, ledger mutations, audit logs, and general user wallets.
- `admin.js` - Dashboard authentication check, session restoration, and admin user rows.
- `payment.js` - Multi-step deposit wizard, QR setup, and server integration endpoints.
- `tournament.js` - Lobby participant lists, check-ins, result reviews, and prize payouts.
- `payment-server.js` - Zero-dependency Node web service.

### Folder Workflows
When a user submits a deposit:
1. An image file and a metadata JSON containing amounts and UTRs are written to `Payments/Pending/`.
2. When the admin approves, both files are moved to `Payments/Approved/` and the user's wallet is credited.
3. When the admin rejects, files are moved to `Payments/Rejected/` with reasons written inside the JSON.
4. Duplicate UTR check blocks anyone from reusing a transaction ID.
