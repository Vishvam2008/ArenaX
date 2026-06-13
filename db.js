const fs = require('fs');
const path = require('path');

let pgPool = null;
let usePostgres = false;

// Configure database client based on environment
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    usePostgres = true;
    console.log('[DB] Configured for PostgreSQL/Supabase connection.');
  } catch (err) {
    console.error('[DB] Failed to load pg library. Falling back to local file database.', err.message);
  }
}

// Local database fallback
const LOCAL_DB_FILE = path.join(__dirname, 'database.json');
let localDb = {
  users: [],
  wallets: {},
  transactions: [],
  tournaments: [],
  participants: [],
  payment_requests: [],
  withdrawals: [],
  notifications: [],
  match_results: [],
  apk_versions: [],
  audit_logs: [],
  admins: []
};

function loadLocalDb() {
  if (fs.existsSync(LOCAL_DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
      localDb = { ...localDb, ...data };
    } catch (e) {
      console.error('[DB] Failed to parse database.json:', e.message);
    }
  } else {
    saveLocalDb();
  }
}

function saveLocalDb() {
  try {
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(localDb, null, 2));
  } catch (e) {
    console.error('[DB] Failed to write database.json:', e.message);
  }
}

if (!usePostgres) {
  loadLocalDb();
  console.log('[DB] Running local JSON database fallback.');
  // Bootstrap default admins if not present
  if (localDb.admins.length === 0) {
    try {
      const bcrypt = require('bcryptjs');
      localDb.admins.push({
        id: "ADM001",
        username: "admin",
        password_hash: bcrypt.hashSync("arenax2026", 10),
        role: "super",
        active: true,
        created_at: new Date().toISOString()
      });
      saveLocalDb();
      console.log('[DB] Created default super admin ADM001.');
    } catch (err) {
      // If bcryptjs is still installing, bootstrap plain text/base64 first, we will update it later
      localDb.admins.push({
        id: "ADM001",
        username: "admin",
        password_hash: "$2a$10$tMh4bL.yVwR4jK1y5/R.oOHFw359K/lT9Bf065kC3J9u89eX/cI42", // bcrypt for arenax2026
        role: "super",
        active: true,
        created_at: new Date().toISOString()
      });
      saveLocalDb();
    }
  }
  // Bootstrap default APK versions if empty
  if (localDb.apk_versions.length === 0) {
    localDb.apk_versions.push({
      id: 1,
      version: "v2.8.1",
      file_size: "31 MB",
      android_version: "Android 8+",
      download_url: "#",
      active: true,
      created_at: new Date().toISOString()
    });
    saveLocalDb();
  }
}

// Helper query function
async function query(text, params) {
  if (usePostgres) {
    const res = await pgPool.query(text, params);
    return res;
  }
  throw new Error('Postgres queries not supported in JSON fallback mode. Use repository methods.');
}

// Unified Repositories
const db = {
  usePostgres,
  query,
  localDb,
  
  // ── AUDIT LOGS ─────────────────────────────────────────────────────────────
  auditLogs: {
    async create({ id, adminUsername, action }) {
      const auditId = id || `AUD-${1000 + (usePostgres ? Date.now() : localDb.audit_logs.length + 1)}`;
      const now = new Date().toISOString();
      if (usePostgres) {
        await pgPool.query(
          'INSERT INTO audit_logs (id, admin_username, action, created_at) VALUES ($1, $2, $3, $4)',
          [auditId, adminUsername, action, now]
        );
      } else {
        localDb.audit_logs.unshift({ id: auditId, admin_username: adminUsername, action, created_at: now });
        saveLocalDb();
      }
      return auditId;
    },
    async list() {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM audit_logs ORDER BY created_at DESC');
        return res.rows;
      } else {
        return localDb.audit_logs;
      }
    }
  },

  // ── USERS ──────────────────────────────────────────────────────────────────
  users: {
    async create(user) {
      if (usePostgres) {
        await pgPool.query(
          `INSERT INTO users (id, username, email, password_hash, sha256_hash_fallback, phone, free_fire_uid, free_fire_username, force_password_reset, is_banned, total_tournaments, total_winnings, total_withdrawals, rejected_results, fraud_flags, ban_history, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            user.id, user.username, user.email, user.password_hash, user.sha256_hash_fallback || null,
            user.phone, user.free_fire_uid, user.free_fire_username, user.force_password_reset || false,
            user.is_banned || false, user.total_tournaments || 0, user.total_winnings || 0.00,
            user.total_withdrawals || 0.00, user.rejected_results || 0,
            JSON.stringify(user.fraud_flags || []), JSON.stringify(user.ban_history || []),
            user.created_at || new Date().toISOString()
          ]
        );
      } else {
        localDb.users.push({
          id: user.id,
          username: user.username,
          email: user.email,
          password_hash: user.password_hash,
          sha256_hash_fallback: user.sha256_hash_fallback || null,
          phone: user.phone,
          free_fire_uid: user.free_fire_uid,
          free_fire_username: user.free_fire_username,
          force_password_reset: user.force_password_reset || false,
          is_banned: user.is_banned || false,
          total_tournaments: user.total_tournaments || 0,
          total_winnings: user.total_winnings || 0.00,
          total_withdrawals: user.total_withdrawals || 0.00,
          rejected_results: user.rejected_results || 0,
          fraud_flags: user.fraud_flags || [],
          ban_history: user.ban_history || [],
          created_at: user.created_at || new Date().toISOString()
        });
        saveLocalDb();
      }
    },
    async findById(id) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM users WHERE id = $1', [id]);
        return res.rows[0] || null;
      } else {
        return localDb.users.find(u => u.id === id) || null;
      }
    },
    async findByUsername(username) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        return res.rows[0] || null;
      } else {
        return localDb.users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
      }
    },
    async findByEmail(email) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        return res.rows[0] || null;
      } else {
        return localDb.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
      }
    },
    async findByFreeFireUid(uid) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM users WHERE free_fire_uid = $1', [uid]);
        return res.rows[0] || null;
      } else {
        return localDb.users.find(u => u.free_fire_uid === uid) || null;
      }
    },
    async update(id, updates) {
      if (usePostgres) {
        const setCols = [];
        const vals = [];
        let index = 1;
        Object.entries(updates).forEach(([key, val]) => {
          setCols.push(`${key} = $${index}`);
          if (typeof val === 'object' && val !== null) {
            vals.push(JSON.stringify(val));
          } else {
            vals.push(val);
          }
          index++;
        });
        vals.push(id);
        await pgPool.query(`UPDATE users SET ${setCols.join(', ')} WHERE id = $${index}`, vals);
      } else {
        const user = localDb.users.find(u => u.id === id);
        if (user) {
          Object.assign(user, updates);
          saveLocalDb();
        }
      }
    },
    async list() {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM users ORDER BY username ASC');
        return res.rows;
      } else {
        return localDb.users;
      }
    }
  },

  // ── WALLETS ────────────────────────────────────────────────────────────────
  wallets: {
    async create(wallet) {
      if (usePostgres) {
        await pgPool.query(
          'INSERT INTO wallets (user_id, balance, frozen, withdrawals_blocked) VALUES ($1, $2, $3, $4)',
          [wallet.user_id, wallet.balance || 0.00, wallet.frozen || false, wallet.withdrawals_blocked || false]
        );
      } else {
        localDb.wallets[wallet.user_id] = {
          balance: Number(wallet.balance || 0.00),
          frozen: !!wallet.frozen,
          withdrawals_blocked: !!wallet.withdrawals_blocked
        };
        saveLocalDb();
      }
    },
    async get(userId) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
        return res.rows[0] || null;
      } else {
        return localDb.wallets[userId] || null;
      }
    },
    async update(userId, updates) {
      if (usePostgres) {
        const setCols = [];
        const vals = [];
        let index = 1;
        Object.entries(updates).forEach(([key, val]) => {
          setCols.push(`${key} = $${index}`);
          vals.push(val);
          index++;
        });
        vals.push(userId);
        await pgPool.query(`UPDATE wallets SET ${setCols.join(', ')} WHERE user_id = $${index}`, vals);
      } else {
        if (!localDb.wallets[userId]) {
          localDb.wallets[userId] = { balance: 0.00, frozen: false, withdrawals_blocked: false };
        }
        if (updates.balance !== undefined) localDb.wallets[userId].balance = Number(updates.balance);
        if (updates.frozen !== undefined) localDb.wallets[userId].frozen = !!updates.frozen;
        if (updates.withdrawals_blocked !== undefined) localDb.wallets[userId].withdrawals_blocked = !!updates.withdrawals_blocked;
        saveLocalDb();
      }
    }
  },

  // ── TRANSACTIONS ───────────────────────────────────────────────────────────
  transactions: {
    async create(tx) {
      if (usePostgres) {
        await pgPool.query(
          'INSERT INTO transactions (user_id, type, label, amount, actor, audit_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [tx.user_id, tx.type, tx.label, tx.amount, tx.actor || 'System', tx.audit_id]
        );
      } else {
        localDb.transactions.push({
          id: localDb.transactions.length + 1,
          user_id: tx.user_id,
          type: tx.type,
          label: tx.label,
          amount: Number(tx.amount),
          actor: tx.actor || 'System',
          audit_id: tx.audit_id,
          created_at: new Date().toISOString()
        });
        saveLocalDb();
      }
    },
    async list(userId) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        return res.rows;
      } else {
        return localDb.transactions.filter(t => t.user_id === userId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      }
    },
    async listAll() {
      if (usePostgres) {
        const res = await pgPool.query('SELECT t.*, u.username FROM transactions t JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC');
        return res.rows;
      } else {
        return localDb.transactions.map(t => {
          const u = localDb.users.find(x => x.id === t.user_id);
          return { ...t, username: u ? u.username : 'Unknown' };
        }).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      }
    }
  },

  // ── TOURNAMENTS ────────────────────────────────────────────────────────────
  tournaments: {
    async create(t) {
      if (usePostgres) {
        const res = await pgPool.query(
          `INSERT INTO tournaments (game, title, mode, map, match_time, entry_fee, prize_pool, player_limit, team_limit, registration, filled_slots, per_kill, booyah, rank1, rank2, rank3, rank4to10, mvp, special_rewards, status, room_id, room_password, room_released)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING id`,
          [
            t.game, t.title, t.mode, t.map, t.match_time, t.entry_fee || 0, t.prize_pool || 0,
            t.player_limit, t.team_limit, t.registration || 'Admin window', t.filled_slots || 0,
            t.per_kill || 0, t.booyah || 0, t.rank1 || 0, t.rank2 || 0, t.rank3 || 0, t.rank4to10 || 0,
            t.mvp || 0, t.special_rewards || 'None', t.status || 'registration_open',
            t.room_id || null, t.room_password || null, t.room_released || false
          ]
        );
        return res.rows[0].id;
      } else {
        const newId = t.id || localDb.tournaments.length + 1;
        localDb.tournaments.push({
          id: newId,
          game: t.game,
          title: t.title,
          mode: t.mode,
          map: t.map,
          match_time: t.match_time,
          entry_fee: Number(t.entry_fee || 0),
          prize_pool: Number(t.prize_pool || 0),
          player_limit: Number(t.player_limit),
          team_limit: Number(t.team_limit),
          registration: t.registration || 'Admin window',
          filled_slots: Number(t.filled_slots || 0),
          per_kill: Number(t.per_kill || 0),
          booyah: Number(t.booyah || 0),
          rank1: Number(t.rank1 || 0),
          rank2: Number(t.rank2 || 0),
          rank3: Number(t.rank3 || 0),
          rank4to10: Number(t.rank4to10 || 0),
          mvp: Number(t.mvp || 0),
          special_rewards: t.special_rewards || 'None',
          status: t.status || 'registration_open',
          room_id: t.room_id || null,
          room_password: t.room_password || null,
          room_released: !!t.room_released,
          created_at: new Date().toISOString()
        });
        saveLocalDb();
        return newId;
      }
    },
    async list() {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM tournaments ORDER BY id DESC');
        return res.rows;
      } else {
        return localDb.tournaments;
      }
    },
    async findById(id) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
        return res.rows[0] || null;
      } else {
        return localDb.tournaments.find(t => t.id === id) || null;
      }
    },
    async update(id, updates) {
      if (usePostgres) {
        const setCols = [];
        const vals = [];
        let index = 1;
        Object.entries(updates).forEach(([key, val]) => {
          setCols.push(`${key} = $${index}`);
          vals.push(val);
          index++;
        });
        vals.push(id);
        await pgPool.query(`UPDATE tournaments SET ${setCols.join(', ')} WHERE id = $${index}`, vals);
      } else {
        const t = localDb.tournaments.find(x => x.id === id);
        if (t) {
          Object.assign(t, updates);
          saveLocalDb();
        }
      }
    }
  },

  // ── PARTICIPANTS ───────────────────────────────────────────────────────────
  participants: {
    async create(p) {
      if (usePostgres) {
        await pgPool.query(
          'INSERT INTO participants (tournament_id, user_id, status, checked_in, refunded, winnings) VALUES ($1, $2, $3, $4, $5, $6)',
          [p.tournament_id, p.user_id, p.status || 'pending', p.checked_in || false, p.refunded || false, p.winnings || 0.00]
        );
      } else {
        localDb.participants.push({
          tournament_id: p.tournament_id,
          user_id: p.user_id,
          status: p.status || 'pending',
          joined_at: new Date().toISOString(),
          checked_in: !!p.checked_in,
          refunded: !!p.refunded,
          winnings: Number(p.winnings || 0.00)
        });
        saveLocalDb();
      }
    },
    async find(tournamentId, userId) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM participants WHERE tournament_id = $1 AND user_id = $2', [tournamentId, userId]);
        return res.rows[0] || null;
      } else {
        return localDb.participants.find(p => p.tournament_id === tournamentId && p.user_id === userId) || null;
      }
    },
    async listByTournament(tournamentId) {
      if (usePostgres) {
        const res = await pgPool.query(
          'SELECT p.*, u.username, u.free_fire_uid, u.free_fire_username FROM participants p JOIN users u ON p.user_id = u.id WHERE p.tournament_id = $1',
          [tournamentId]
        );
        return res.rows;
      } else {
        return localDb.participants
          .filter(p => p.tournament_id === tournamentId)
          .map(p => {
            const u = localDb.users.find(x => x.id === p.user_id);
            return {
              ...p,
              username: u ? u.username : 'Unknown',
              free_fire_uid: u ? u.free_fire_uid : '',
              free_fire_username: u ? u.free_fire_username : ''
            };
          });
      }
    },
    async listByUser(userId) {
      if (usePostgres) {
        const res = await pgPool.query(
          'SELECT p.*, t.title, t.match_time, t.status as tournament_status FROM participants p JOIN tournaments t ON p.tournament_id = t.id WHERE p.user_id = $1',
          [userId]
        );
        return res.rows;
      } else {
        return localDb.participants
          .filter(p => p.user_id === userId)
          .map(p => {
            const t = localDb.tournaments.find(x => x.id === p.tournament_id);
            return {
              ...p,
              title: t ? t.title : 'Deleted Tournament',
              match_time: t ? t.match_time : '',
              tournament_status: t ? t.status : 'completed'
            };
          });
      }
    },
    async update(tournamentId, userId, updates) {
      if (usePostgres) {
        const setCols = [];
        const vals = [];
        let index = 1;
        Object.entries(updates).forEach(([key, val]) => {
          setCols.push(`${key} = $${index}`);
          vals.push(val);
          index++;
        });
        vals.push(tournamentId, userId);
        await pgPool.query(`UPDATE participants SET ${setCols.join(', ')} WHERE tournament_id = $${index} AND user_id = $${index + 1}`, vals);
      } else {
        const p = localDb.participants.find(x => x.tournament_id === tournamentId && x.user_id === userId);
        if (p) {
          Object.assign(p, updates);
          saveLocalDb();
        }
      }
    },
    async delete(tournamentId, userId) {
      if (usePostgres) {
        await pgPool.query('DELETE FROM participants WHERE tournament_id = $1 AND user_id = $2', [tournamentId, userId]);
      } else {
        localDb.participants = localDb.participants.filter(x => !(x.tournament_id === tournamentId && x.user_id === userId));
        saveLocalDb();
      }
    }
  },

  // ── PAYMENT REQUESTS ───────────────────────────────────────────────────────
  paymentRequests: {
    async create(pr) {
      if (usePostgres) {
        await pgPool.query(
          `INSERT INTO payment_requests (request_id, user_id, amount, utr_number, screenshot_filename, screenshot_hash, status, admin_notes, linked_request_id, duplicate_flags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            pr.request_id, pr.user_id, pr.amount, pr.utr_number, pr.screenshot_filename,
            pr.screenshot_hash, pr.status || 'Pending Verification', pr.admin_notes || '',
            pr.linked_request_id || null, JSON.stringify(pr.duplicate_flags || [])
          ]
        );
      } else {
        localDb.payment_requests.push({
          request_id: pr.request_id,
          user_id: pr.user_id,
          amount: Number(pr.amount),
          utr_number: pr.utr_number,
          screenshot_filename: pr.screenshot_filename,
          screenshot_hash: pr.screenshot_hash,
          status: pr.status || 'Pending Verification',
          admin_notes: pr.admin_notes || '',
          linked_request_id: pr.linked_request_id || null,
          duplicate_flags: pr.duplicate_flags || [],
          submitted_at: pr.submitted_at || new Date().toISOString(),
          reviewed_at: pr.reviewed_at || null
        });
        saveLocalDb();
      }
    },
    async findById(requestId) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM payment_requests WHERE request_id = $1', [requestId]);
        return res.rows[0] || null;
      } else {
        return localDb.payment_requests.find(pr => pr.request_id === requestId) || null;
      }
    },
    async findByUtr(utr) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM payment_requests WHERE utr_number = $1', [utr]);
        return res.rows[0] || null;
      } else {
        return localDb.payment_requests.find(pr => pr.utr_number === utr) || null;
      }
    },
    async findByScreenshotHash(hash) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM payment_requests WHERE screenshot_hash = $1', [hash]);
        return res.rows[0] || null;
      } else {
        return localDb.payment_requests.find(pr => pr.screenshot_hash === hash) || null;
      }
    },
    async listByUser(userId) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM payment_requests WHERE user_id = $1 ORDER BY submitted_at DESC', [userId]);
        return res.rows;
      } else {
        return localDb.payment_requests.filter(pr => pr.user_id === userId).sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      }
    },
    async listAll() {
      if (usePostgres) {
        const res = await pgPool.query(
          'SELECT pr.*, u.username, u.email as user_email, u.phone as user_phone FROM payment_requests pr JOIN users u ON pr.user_id = u.id ORDER BY pr.submitted_at DESC'
        );
        return res.rows;
      } else {
        return localDb.payment_requests.map(pr => {
          const u = localDb.users.find(x => x.id === pr.user_id);
          return {
            ...pr,
            username: u ? u.username : 'Unknown',
            user_email: u ? u.email : '',
            user_phone: u ? u.phone : ''
          };
        }).sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      }
    },
    async update(requestId, updates) {
      if (usePostgres) {
        const setCols = [];
        const vals = [];
        let index = 1;
        Object.entries(updates).forEach(([key, val]) => {
          setCols.push(`${key} = $${index}`);
          if (typeof val === 'object' && val !== null) {
            vals.push(JSON.stringify(val));
          } else {
            vals.push(val);
          }
          index++;
        });
        vals.push(requestId);
        await pgPool.query(`UPDATE payment_requests SET ${setCols.join(', ')} WHERE request_id = $${index}`, vals);
      } else {
        const pr = localDb.payment_requests.find(x => x.request_id === requestId);
        if (pr) {
          Object.assign(pr, updates);
          saveLocalDb();
        }
      }
    }
  },

  // ── WITHDRAWALS ────────────────────────────────────────────────────────────
  withdrawals: {
    async create(w) {
      if (usePostgres) {
        const res = await pgPool.query(
          'INSERT INTO withdrawals (user_id, amount, upi_id, status, admin_notes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [w.user_id, w.amount, w.upi_id, w.status || 'Pending Verification', w.admin_notes || '']
        );
        return res.rows[0].id;
      } else {
        const newId = localDb.withdrawals.length + 1;
        localDb.withdrawals.push({
          id: newId,
          user_id: w.user_id,
          amount: Number(w.amount),
          upi_id: w.upi_id,
          status: w.status || 'Pending Verification',
          admin_notes: w.admin_notes || '',
          submitted_at: new Date().toISOString(),
          reviewed_at: null
        });
        saveLocalDb();
        return newId;
      }
    },
    async findById(id) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM withdrawals WHERE id = $1', [id]);
        return res.rows[0] || null;
      } else {
        return localDb.withdrawals.find(w => w.id === id) || null;
      }
    },
    async listByUser(userId) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY submitted_at DESC', [userId]);
        return res.rows;
      } else {
        return localDb.withdrawals.filter(w => w.user_id === userId).sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      }
    },
    async listAll() {
      if (usePostgres) {
        const res = await pgPool.query(
          'SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id ORDER BY w.submitted_at DESC'
        );
        return res.rows;
      } else {
        return localDb.withdrawals.map(w => {
          const u = localDb.users.find(x => x.id === w.user_id);
          return { ...w, username: u ? u.username : 'Unknown' };
        }).sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      }
    },
    async update(id, updates) {
      if (usePostgres) {
        const setCols = [];
        const vals = [];
        let index = 1;
        Object.entries(updates).forEach(([key, val]) => {
          setCols.push(`${key} = $${index}`);
          vals.push(val);
          index++;
        });
        vals.push(id);
        await pgPool.query(`UPDATE withdrawals SET ${setCols.join(', ')} WHERE id = $${index}`, vals);
      } else {
        const w = localDb.withdrawals.find(x => x.id === id);
        if (w) {
          Object.assign(w, updates);
          saveLocalDb();
        }
      }
    }
  },

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
  notifications: {
    async create({ user_id, title, message }) {
      if (usePostgres) {
        await pgPool.query(
          'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
          [user_id, title, message]
        );
      } else {
        localDb.notifications.unshift({
          id: localDb.notifications.length + 1,
          user_id,
          title,
          message,
          read: false,
          created_at: new Date().toISOString()
        });
        saveLocalDb();
      }
    },
    async listByUser(userId) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
        return res.rows;
      } else {
        return localDb.notifications.filter(n => n.user_id === userId).slice(0, 50);
      }
    },
    async markAsRead(userId) {
      if (usePostgres) {
        await pgPool.query('UPDATE notifications SET read = TRUE WHERE user_id = $1', [userId]);
      } else {
        localDb.notifications.forEach(n => {
          if (n.user_id === userId) n.read = true;
        });
        saveLocalDb();
      }
    }
  },

  // ── MATCH RESULTS ──────────────────────────────────────────────────────────
  matchResults: {
    async create(r) {
      if (usePostgres) {
        await pgPool.query(
          `INSERT INTO match_results (tournament_id, user_id, screenshot_filename, screenshot_hash, kills, rank, booyah, status, admin_notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [r.tournament_id, r.user_id, r.screenshot_filename, r.screenshot_hash, r.kills || 0, r.rank, r.booyah || false, r.status || 'Pending Verification', r.admin_notes || '']
        );
      } else {
        localDb.match_results.push({
          id: localDb.match_results.length + 1,
          tournament_id: r.tournament_id,
          user_id: r.user_id,
          screenshot_filename: r.screenshot_filename,
          screenshot_hash: r.screenshot_hash,
          kills: Number(r.kills || 0),
          rank: Number(r.rank),
          booyah: !!r.booyah,
          status: r.status || 'Pending Verification',
          admin_notes: r.admin_notes || '',
          submitted_at: new Date().toISOString(),
          reviewed_at: null
        });
        saveLocalDb();
      }
    },
    async find(tournamentId, userId) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM match_results WHERE tournament_id = $1 AND user_id = $2', [tournamentId, userId]);
        return res.rows[0] || null;
      } else {
        return localDb.match_results.find(mr => mr.tournament_id === tournamentId && mr.user_id === userId) || null;
      }
    },
    async listByTournament(tournamentId) {
      if (usePostgres) {
        const res = await pgPool.query(
          'SELECT mr.*, u.username, u.free_fire_uid FROM match_results mr JOIN users u ON mr.user_id = u.id WHERE mr.tournament_id = $1 ORDER BY mr.submitted_at DESC',
          [tournamentId]
        );
        return res.rows;
      } else {
        return localDb.match_results
          .filter(mr => mr.tournament_id === tournamentId)
          .map(mr => {
            const u = localDb.users.find(x => x.id === mr.user_id);
            return {
              ...mr,
              username: u ? u.username : 'Unknown',
              free_fire_uid: u ? u.free_fire_uid : ''
            };
          });
      }
    },
    async update(id, updates) {
      if (usePostgres) {
        const setCols = [];
        const vals = [];
        let index = 1;
        Object.entries(updates).forEach(([key, val]) => {
          setCols.push(`${key} = $${index}`);
          vals.push(val);
          index++;
        });
        vals.push(id);
        await pgPool.query(`UPDATE match_results SET ${setCols.join(', ')} WHERE id = $${index}`, vals);
      } else {
        const mr = localDb.match_results.find(x => x.id === id);
        if (mr) {
          Object.assign(mr, updates);
          saveLocalDb();
        }
      }
    }
  },

  // ── APK VERSIONS ───────────────────────────────────────────────────────────
  apkVersions: {
    async getActive() {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM apk_versions WHERE active = TRUE ORDER BY created_at DESC LIMIT 1');
        return res.rows[0] || null;
      } else {
        return localDb.apk_versions.find(a => a.active) || null;
      }
    },
    async create(apk) {
      if (usePostgres) {
        await pgPool.query(
          'INSERT INTO apk_versions (version, file_size, android_version, download_url, active) VALUES ($1, $2, $3, $4, $5)',
          [apk.version, apk.file_size, apk.android_version, apk.download_url, apk.active || true]
        );
      } else {
        localDb.apk_versions.push({
          id: localDb.apk_versions.length + 1,
          version: apk.version,
          file_size: apk.file_size,
          android_version: apk.android_version,
          download_url: apk.download_url,
          active: !!apk.active,
          created_at: new Date().toISOString()
        });
        saveLocalDb();
      }
    }
  },

  // ── ADMINS ─────────────────────────────────────────────────────────────────
  admins: {
    async findByUsername(username) {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM admins WHERE username = $1', [username]);
        return res.rows[0] || null;
      } else {
        return localDb.admins.find(a => a.username === username) || null;
      }
    },
    async create(admin) {
      if (usePostgres) {
        await pgPool.query(
          'INSERT INTO admins (id, username, password_hash, role, active) VALUES ($1, $2, $3, $4, $5)',
          [admin.id, admin.username, admin.password_hash, admin.role || 'admin', admin.active || true]
        );
      } else {
        localDb.admins.push({
          id: admin.id,
          username: admin.username,
          password_hash: admin.password_hash,
          role: admin.role || 'admin',
          active: !!admin.active,
          created_at: new Date().toISOString()
        });
        saveLocalDb();
      }
    },
    async list() {
      if (usePostgres) {
        const res = await pgPool.query('SELECT * FROM admins ORDER BY username ASC');
        return res.rows;
      } else {
        return localDb.admins;
      }
    },
    async update(id, updates) {
      if (usePostgres) {
        const setCols = [];
        const vals = [];
        let index = 1;
        Object.entries(updates).forEach(([key, val]) => {
          setCols.push(`${key} = $${index}`);
          vals.push(val);
          index++;
        });
        vals.push(id);
        await pgPool.query(`UPDATE admins SET ${setCols.join(', ')} WHERE id = $${index}`, vals);
      } else {
        const a = localDb.admins.find(x => x.id === id);
        if (a) {
          Object.assign(a, updates);
          saveLocalDb();
        }
      }
    }
  }
};

module.exports = db;
