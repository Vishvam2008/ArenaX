# Changelog

All notable changes to the ArenaX esports platform will be documented in this file.

## [v0.9.0-beta] — 2026-06-13

### Added
- **Unified Local Storage Persistence**: Synchronized all client-side variables (`state.wallet`, `state.ledger`, `state.audit`, `state.requests`, `state.tournaments`, `state.playerProfiles`, `state.recentWinners`, `state.qrConfig`) under browser key `ax_state`.
- **Administrative Settings Saving**: Explicitly saved states on QR configuration changes.
- **Environment Configuration**: Set up `.env.example` templates and native Node.js parser in `payment-server.js` to read local variable keys without dependency packages.
- **Git Ignoring Security**: Set up `.gitignore` directives protecting logs, local environments, payment screenshots, and development config directories from commits.
- **Max Mobile Media Query**: Added responsive portrait tweaks (`@media (max-width: 380px)`) in `styles.css` to prevent layout overflows.

### Changed
- **Client-Server Payment Sync**: Synchronized all deposit submissions, approvals, and rejections. Front-end transitions wait for a resolved server promise before updating client states.
- **Admin Image Fetch Auth**: Embedded base64 auth tokens in query parameter string fetches (`&auth=`) for admin screenshots, resolving browser-native image loading headers barriers.

### Fixed
- **Critical Admin Auth Bypass**: Corrected dashboard login checks in `admin.js` to query `/api/admins` directly, require strict HTTP 200 OK validations, and reject all invalid or dummy sessions.
- **Lobby-Wallet Free Entries exploit**: Refactored `approveParticipant()` in `tournament.js` to debit user balances directly if the requests queue is cleared on reloads.
- **Duplicate Rewards Payouts exploit**: Added checks inside reward distributions to restrict payouts if the tournament status is already `"completed"`.
