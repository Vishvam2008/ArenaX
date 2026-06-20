# ArenaX — Database Documentation

> **PostgreSQL 14+ required.** Hosted on Supabase (managed PostgreSQL). All queries use parameterized statements. Schema is versioned via numbered migration files (001–019). File assets are stored in Supabase Storage.

---

## Table of Contents

1. [Overview](#overview)
2. [All 18 Tables](#all-18-tables)
3. [Entity Relationship Descriptions](#entity-relationship-descriptions)
4. [Leaderboard — Materialized Strategy](#leaderboard--materialized-strategy)
5. [Settings Table Default Values](#settings-table-default-values)
6. [Migration Files (001–019)](#migration-files-001019)
7. [Seed Script Usage](#seed-script-usage)
8. [Migration Runner Usage](#migration-runner-usage)
9. [Backup Recommendations](#backup-recommendations)
10. [Performance Indexes Explained](#performance-indexes-explained)
11. [Connection Pooling (pgBouncer)](#connection-pooling-pgbouncer)

---

## Overview

| Property | Value |
|---|---|
| Database Engine | PostgreSQL 14+ |
| Hosting | Supabase (managed) |
| Connection Pooling | pgBouncer (transaction mode, port 6543) |
| Query Strategy | Parameterized queries only (no raw interpolation) |
| Migration Strategy | Sequential numbered files (001–019) |
| File Storage | Supabase Storage (bucket: `arenax`) |
| Seed | `node scripts/seed.js` |
| Schema Version | 19 migrations |

---

## All 18 Tables

---

### 1. `users`

Stores all platform users including regular players, admins, and super admins.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `username` | `varchar(30)` | NOT NULL, UNIQUE | — |
| `email` | `varchar(255)` | NOT NULL, UNIQUE | — |
| `password_hash` | `text` | NOT NULL | — |
| `phone` | `varchar(15)` | nullable | — |
| `avatar_url` | `text` | nullable | — |
| `role` | `enum('user','admin','super_admin')` | NOT NULL | `'user'` |
| `is_banned` | `boolean` | NOT NULL | `false` |
| `ban_reason` | `text` | nullable | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | nullable | — |

**Indexes:**
- `idx_users_email` on `email` — fast login lookup
- `idx_users_username` on `username` — fast username search
- `idx_users_role` on `role` — admin panel filtering

---

### 2. `refresh_tokens`

Stores hashed refresh tokens for the JWT refresh-token rotation pattern. Tokens are deleted on logout or rotation.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` ON DELETE CASCADE | — |
| `token_hash` | `text` | NOT NULL, UNIQUE | — |
| `expires_at` | `timestamptz` | NOT NULL | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_refresh_tokens_user_id` on `user_id`
- `idx_refresh_tokens_token_hash` on `token_hash`

---

### 3. `password_resets`

One-time password reset tokens, expire after 15 minutes, single-use.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` ON DELETE CASCADE | — |
| `token_hash` | `text` | NOT NULL, UNIQUE | — |
| `expires_at` | `timestamptz` | NOT NULL | — |
| `used` | `boolean` | NOT NULL | `false` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_password_resets_token_hash` on `token_hash`

---

### 4. `wallets`

Each user has exactly one wallet. Balance cannot go below zero (DB-level CHECK constraint). Wallets can be frozen by admins.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, UNIQUE, FK → `users.id` ON DELETE CASCADE | — |
| `balance` | `numeric(12,2)` | NOT NULL, CHECK (`balance >= 0`) | `0.00` |
| `is_frozen` | `boolean` | NOT NULL | `false` |
| `freeze_reason` | `text` | nullable | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | nullable | — |

**Indexes:**
- `idx_wallets_user_id` on `user_id`

---

### 5. `transactions`

Immutable financial ledger. Every credit/debit creates one record.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` | — |
| `type` | `enum('deposit','withdrawal','tournament_fee','reward','refund')` | NOT NULL | — |
| `amount` | `numeric(12,2)` | NOT NULL | — |
| `status` | `enum('pending','approved','rejected','completed')` | NOT NULL | `'pending'` |
| `reference` | `text` | nullable | — |
| `notes` | `text` | nullable | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_transactions_user_id`, `idx_transactions_type`, `idx_transactions_status`, `idx_transactions_created_at`

---

### 6. `deposits`

User deposit requests with duplicate-prevention via UTR uniqueness and screenshot hash deduplication.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` | — |
| `amount` | `numeric(12,2)` | NOT NULL | — |
| `utr_number` | `varchar(50)` | NOT NULL, UNIQUE | — |
| `screenshot_url` | `text` | NOT NULL | — |
| `screenshot_hash` | `varchar(64)` | NOT NULL, UNIQUE | — |
| `status` | `enum('pending','approved','rejected')` | NOT NULL | `'pending'` |
| `admin_note` | `text` | nullable | — |
| `reviewed_by` | `uuid` | nullable, FK → `users.id` | — |
| `reviewed_at` | `timestamptz` | nullable | — |
| `transaction_id` | `uuid` | nullable, FK → `transactions.id` | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_deposits_user_id`, `idx_deposits_status`, `idx_deposits_utr_number`, `idx_deposits_screenshot_hash`

---

### 7. `withdrawals`

User withdrawal requests. Balance is deducted on creation; refunded on rejection.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` | — |
| `amount` | `numeric(12,2)` | NOT NULL | — |
| `upi_id` | `varchar(100)` | NOT NULL | — |
| `status` | `enum('pending','approved','rejected')` | NOT NULL | `'pending'` |
| `admin_note` | `text` | nullable | — |
| `reviewed_by` | `uuid` | nullable, FK → `users.id` | — |
| `reviewed_at` | `timestamptz` | nullable | — |
| `transaction_id` | `uuid` | nullable, FK → `transactions.id` | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_withdrawals_user_id`, `idx_withdrawals_status`

---

### 8. `tournaments`

Core tournament entity managing full lifecycle from creation to completion.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `title` | `varchar(150)` | NOT NULL | — |
| `game` | `varchar(50)` | NOT NULL | — |
| `mode` | `enum('solo','duo','squad')` | NOT NULL | — |
| `max_teams` | `integer` | NOT NULL | — |
| `entry_fee` | `numeric(10,2)` | NOT NULL | `0.00` |
| `prize_pool` | `numeric(12,2)` | NOT NULL | `0.00` |
| `status` | `enum('upcoming','registration_open','check_in','live','completed','cancelled')` | NOT NULL | `'upcoming'` |
| `start_time` | `timestamptz` | NOT NULL | — |
| `check_in_open_at` | `timestamptz` | nullable | — |
| `room_reveal_at` | `timestamptz` | nullable | — |
| `room_id` | `text` | nullable | — |
| `room_password` | `text` | nullable | — |
| `banner_url` | `text` | nullable | — |
| `description` | `text` | nullable | — |
| `rules` | `text` | nullable | — |
| `created_by` | `uuid` | NOT NULL, FK → `users.id` | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | nullable | — |

**Indexes:**
- `idx_tournaments_status`, `idx_tournaments_start_time`, `idx_tournaments_game`

**Status Lifecycle:**
```
upcoming → registration_open → check_in → live → completed
                                                ↘ cancelled (from any state)
```

---

### 9. `teams`

Registered team (or solo player) in a tournament. Auto-assigned slot number on registration.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `tournament_id` | `uuid` | NOT NULL, FK → `tournaments.id` | — |
| `name` | `varchar(50)` | NOT NULL | — |
| `join_code` | `varchar(10)` | UNIQUE | auto-generated |
| `leader_id` | `uuid` | NOT NULL, FK → `users.id` | — |
| `slot_number` | `integer` | nullable | — |
| `status` | `enum('registered','checked_in','eliminated','winner')` | NOT NULL | `'registered'` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Unique Constraints:**
- `UNIQUE(tournament_id, name)` — unique team names per tournament
- `UNIQUE(join_code)` — globally unique join codes

**Indexes:**
- `idx_teams_tournament_id`, `idx_teams_leader_id`, `idx_teams_join_code`

---

### 10. `team_members`

Maps users to teams (many-to-many junction table).

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `team_id` | `uuid` | NOT NULL, FK → `teams.id` ON DELETE CASCADE | — |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` | — |
| `role` | `enum('leader','member')` | NOT NULL | `'member'` |
| `joined_at` | `timestamptz` | NOT NULL | `now()` |

**Unique Constraints:**
- `UNIQUE(team_id, user_id)`

**Indexes:**
- `idx_team_members_team_id`, `idx_team_members_user_id`

---

### 11. `tournament_results`

Result submissions per team per tournament. One record per team. Approved by admin before rewards distribute.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `tournament_id` | `uuid` | NOT NULL, FK → `tournaments.id` | — |
| `team_id` | `uuid` | NOT NULL, FK → `teams.id` | — |
| `rank` | `integer` | NOT NULL | — |
| `kills` | `integer` | NOT NULL | `0` |
| `score` | `integer` | NOT NULL | `0` |
| `reward_amount` | `numeric(10,2)` | NOT NULL | `0.00` |
| `reward_distributed` | `boolean` | NOT NULL | `false` |
| `submitted_by` | `uuid` | NOT NULL, FK → `users.id` | — |
| `screenshot_url` | `text` | nullable | — |
| `approved_by` | `uuid` | nullable, FK → `users.id` | — |
| `approved_at` | `timestamptz` | nullable | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Unique Constraints:**
- `UNIQUE(tournament_id, team_id)`

---

### 12. `leaderboard`

Pre-computed aggregation table. Updated via UPSERT after each reward distribution.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, UNIQUE, FK → `users.id` | — |
| `total_earnings` | `numeric(12,2)` | NOT NULL | `0.00` |
| `tournaments_played` | `integer` | NOT NULL | `0` |
| `tournaments_won` | `integer` | NOT NULL | `0` |
| `total_kills` | `integer` | NOT NULL | `0` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_leaderboard_user_id`
- `idx_leaderboard_total_earnings DESC` — for rank ordering

---

### 13. `notifications`

In-app notification system. `user_id = NULL` = broadcast to all users.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | nullable, FK → `users.id` ON DELETE CASCADE | — |
| `title` | `varchar(150)` | NOT NULL | — |
| `message` | `text` | NOT NULL | — |
| `type` | `enum('info','warning','success','error')` | NOT NULL | `'info'` |
| `is_read` | `boolean` | NOT NULL | `false` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_notifications_user_id`, `idx_notifications_is_read`, `idx_notifications_created_at DESC`

---

### 14. `tickets`

Support ticket headers. Messages in `ticket_messages`.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` | — |
| `subject` | `varchar(200)` | NOT NULL | — |
| `status` | `enum('open','in_progress','resolved','closed')` | NOT NULL | `'open'` |
| `priority` | `enum('low','medium','high')` | NOT NULL | `'medium'` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | nullable | — |

**Indexes:**
- `idx_tickets_user_id`, `idx_tickets_status`

---

### 15. `ticket_messages`

Individual messages within a support ticket thread.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `ticket_id` | `uuid` | NOT NULL, FK → `tickets.id` ON DELETE CASCADE | — |
| `sender_id` | `uuid` | NOT NULL, FK → `users.id` | — |
| `message` | `text` | NOT NULL | — |
| `is_admin_reply` | `boolean` | NOT NULL | `false` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_ticket_messages_ticket_id`

---

### 16. `apk_releases`

APK version management. Only one record is `is_active = true` at a time (enforced at app level).

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `version` | `varchar(20)` | NOT NULL, UNIQUE | — |
| `file_url` | `text` | NOT NULL | — |
| `file_size` | `bigint` | nullable | — |
| `changelog` | `text` | nullable | — |
| `is_active` | `boolean` | NOT NULL | `true` |
| `uploaded_by` | `uuid` | NOT NULL, FK → `users.id` | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_apk_releases_is_active`, `idx_apk_releases_version`

---

### 17. `audit_logs`

Immutable log of all admin actions. Never updated or deleted.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `admin_id` | `uuid` | NOT NULL, FK → `users.id` | — |
| `action` | `varchar(100)` | NOT NULL | — |
| `target_type` | `varchar(50)` | nullable | — |
| `target_id` | `uuid` | nullable | — |
| `details` | `jsonb` | nullable | — |
| `ip_address` | `inet` | nullable | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**Indexes:**
- `idx_audit_logs_admin_id`, `idx_audit_logs_action`, `idx_audit_logs_created_at DESC`
- `idx_audit_logs_target` on `(target_type, target_id)` — composite index for target-based lookups

---

### 18. `settings`

Key-value store for platform-wide configuration managed by super admins.

| Column | Type | Constraints | Default |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `key` | `varchar(100)` | NOT NULL, UNIQUE | — |
| `value` | `text` | NOT NULL | — |
| `updated_by` | `uuid` | nullable, FK → `users.id` | — |
| `updated_at` | `timestamptz` | nullable | — |

**Indexes:**
- `idx_settings_key` on `key`

---

## Entity Relationship Descriptions

```
users (1) ───── (1) wallets
users (1) ───── (N) refresh_tokens
users (1) ───── (N) password_resets
users (1) ───── (N) transactions
users (1) ───── (N) deposits
users (1) ───── (N) withdrawals
users (1) ───── (N) tournaments  [as creator]
users (1) ───── (N) teams        [as leader]
users (1) ───── (N) team_members
users (1) ───── (1) leaderboard
users (1) ───── (N) notifications
users (1) ───── (N) tickets
users (1) ───── (N) ticket_messages
users (1) ───── (N) audit_logs   [as admin]

tournaments (1) ── (N) teams
tournaments (1) ── (N) tournament_results

teams (1) ──────── (N) team_members
teams (1) ──────── (1) tournament_results

tickets (1) ─────── (N) ticket_messages

deposits (1) ──────── (1) transactions  [on approval]
withdrawals (1) ────── (1) transactions [on creation]
tournament_results ── (1) transactions  [on reward distribution]
```

**Key Relationships:**

- **User → Wallet**: One-to-one. Created automatically at registration via DB trigger or app logic.
- **User → Teams**: A user can lead multiple teams across different tournaments but can only be a member of one team per tournament (enforced at app level).
- **Tournament → Teams**: A tournament has many registered teams. `max_teams` limits registration capacity.
- **Team → TeamMembers**: Size constrained by tournament mode (solo=1, duo=2, squad=4 players).
- **Deposit → Transaction**: A transaction record is created when a deposit is approved.
- **TournamentResult → Transaction**: When admin approves results and distributes rewards, a `reward` transaction is created for each winning team member's wallet credit.

---

## Leaderboard — Materialized Strategy

The `leaderboard` table uses a **pre-computed aggregation** approach (not a PostgreSQL `MATERIALIZED VIEW`) for simplicity and real-time consistency.

**Update after reward distribution:**
```sql
INSERT INTO leaderboard (user_id, total_earnings, tournaments_played, tournaments_won, total_kills, updated_at)
VALUES ($userId, $earnings, 1, $isWinner::int, $kills, now())
ON CONFLICT (user_id) DO UPDATE SET
  total_earnings    = leaderboard.total_earnings + EXCLUDED.total_earnings,
  tournaments_played = leaderboard.tournaments_played + 1,
  tournaments_won   = leaderboard.tournaments_won + EXCLUDED.tournaments_won,
  total_kills       = leaderboard.total_kills + EXCLUDED.total_kills,
  updated_at        = now();
```

**Rank query:**
```sql
SELECT
  l.*,
  u.username,
  u.avatar_url,
  ROW_NUMBER() OVER (ORDER BY l.total_earnings DESC, l.total_kills DESC) AS rank
FROM leaderboard l
JOIN users u ON u.id = l.user_id
ORDER BY l.total_earnings DESC
LIMIT $1 OFFSET $2;
```

---

## Settings Table Default Values

| Key | Default Value | Description |
|---|---|---|
| `upi_id` | `''` | Platform UPI ID shown to users for deposits |
| `upi_qr_url` | `''` | URL to UPI QR code image in Supabase Storage |
| `min_deposit` | `'100'` | Minimum deposit amount (INR) |
| `max_deposit` | `'50000'` | Maximum deposit amount (INR) |
| `min_withdrawal` | `'100'` | Minimum withdrawal amount (INR) |
| `max_withdrawal` | `'10000'` | Maximum withdrawal amount (INR) |
| `maintenance_mode` | `'false'` | If `'true'`, API returns 503 to all non-admin requests |
| `platform_name` | `'ArenaX'` | Platform display name |
| `support_email` | `''` | Support contact email shown to users |

---

## Migration Files (001–019)

| # | File | Description |
|---|---|---|
| 001 | `001_create_enum_types.sql` | Creates all PostgreSQL ENUM types |
| 002 | `002_create_users.sql` | `users` table with indexes |
| 003 | `003_create_refresh_tokens.sql` | `refresh_tokens` table |
| 004 | `004_create_password_resets.sql` | `password_resets` table |
| 005 | `005_create_wallets.sql` | `wallets` with CHECK constraint |
| 006 | `006_create_transactions.sql` | `transactions` ledger |
| 007 | `007_create_deposits.sql` | `deposits` with UNIQUE UTR and hash |
| 008 | `008_create_withdrawals.sql` | `withdrawals` table |
| 009 | `009_create_tournaments.sql` | `tournaments` with lifecycle enum |
| 010 | `010_create_teams.sql` | `teams` with unique join_code |
| 011 | `011_create_team_members.sql` | `team_members` junction table |
| 012 | `012_create_tournament_results.sql` | `tournament_results` with composite unique |
| 013 | `013_create_leaderboard.sql` | `leaderboard` aggregation table |
| 014 | `014_create_notifications.sql` | `notifications` with broadcast support |
| 015 | `015_create_tickets.sql` | `tickets` + `ticket_messages` |
| 016 | `016_create_apk_releases.sql` | `apk_releases` table |
| 017 | `017_create_audit_logs.sql` | `audit_logs` with JSONB details |
| 018 | `018_create_settings.sql` | `settings` key-value table |
| 019 | `019_create_performance_indexes.sql` | All supplementary performance indexes |

---

## Seed Script Usage

```bash
cd backend
node scripts/seed.js
```

**What the seed script creates:**

1. **Super Admin User:**
   - Username: `superadmin`
   - Email: `admin@arenax.com`
   - Password: `ArenaX@SuperAdmin2024!` *(change immediately!)*
   - Role: `super_admin`

2. **Default Settings:** All 9 settings keys with default values

3. **Leaderboard entry** for the super admin

> The seed uses `INSERT ... ON CONFLICT DO NOTHING`. Safe to run multiple times.

---

## Migration Runner Usage

```bash
cd backend
node scripts/migrate.js
```

The runner:
1. Creates `schema_migrations` tracking table if absent
2. Reads `.sql` files from `backend/migrations/` alphabetically
3. Skips already-applied migrations
4. Applies pending migrations in a transaction (rolls back on error)
5. Records each applied migration with timestamp

---

## Backup Recommendations

### Manual pg_dump

```bash
# Use direct connection (port 5432) for backups, not pgBouncer
pg_dump \
  "postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres" \
  --format=custom \
  --file=arenax_backup_$(date +%Y%m%d_%H%M%S).dump

# Restore
pg_restore \
  --dbname="postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres" \
  arenax_backup_20240101_120000.dump
```

### Recommended Schedule

| Frequency | Method | Retention |
|---|---|---|
| Daily | Supabase automated (Pro) | 7 days |
| Weekly | Manual pg_dump to S3/Drive | 4 weeks |
| Pre-migration | Manual pg_dump | Permanent |
| Pre-tournament | Manual pg_dump | 30 days |

---

## Performance Indexes Explained

| Index | Table | Purpose |
|---|---|---|
| `idx_users_email` | users | O(log n) login lookup — hot path |
| `idx_users_role` | users | Admin panel role filter |
| `idx_refresh_tokens_token_hash` | refresh_tokens | Every authenticated request validates token |
| `idx_deposits_utr_number` | deposits | Duplicate UTR detection — hot path |
| `idx_deposits_screenshot_hash` | deposits | Duplicate screenshot detection |
| `idx_deposits_status` | deposits | Admin pending queue |
| `idx_transactions_user_id` | transactions | Wallet history per user |
| `idx_transactions_created_at` | transactions | Date-range queries |
| `idx_tournaments_status` | tournaments | Homepage listing by status |
| `idx_tournaments_start_time` | tournaments | Chronological sorting |
| `idx_teams_join_code` | teams | Join-by-code — single record lookup |
| `idx_leaderboard_total_earnings DESC` | leaderboard | Ordered leaderboard rendering |
| `idx_notifications_user_id` | notifications | Fetch all user notifications |
| `idx_notifications_is_read` | notifications | Unread count badge |
| `idx_audit_logs_created_at DESC` | audit_logs | Admin view — newest first |
| `idx_audit_logs_target` | audit_logs | "All actions on this deposit" queries |

---

## Connection Pooling (pgBouncer)

| Mode | Port | Use Case |
|---|---|---|
| Direct | 5432 | Migrations, pg_dump — needs persistent connections |
| Pooler (Transaction) | 6543 | Application runtime — short-lived pooled connections |

**Recommended `DATABASE_URL` for production:**
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

**Why transaction mode?**
- Supabase free/pro tiers have limited direct connections
- pgBouncer multiplexes many app connections into few real DB connections
- Essential for Render.com auto-scaling (spins down/up on free tier)
