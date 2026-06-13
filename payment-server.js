/**
 * ============================================================
 *  ArenaX Production Payment & Persistence Server
 * ============================================================
 *  Node.js server that manages user accounts, wallet transactions,
 *  tournament logs, screenshot uploads, and admin controls.
 *  Supports PostgreSQL/Supabase and JSON file database fallbacks.
 *
 *  Port: 4400
 * ============================================================
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const db = require('./db');
const storage = require('./storage');

// ── Configuration ───────────────────────────────────────────
const PORT = Number(process.env.ARENAX_PAYMENT_PORT || 4400);
const MAX_BODY_BYTES = Number(process.env.ARENAX_PAYMENT_MAX_BODY_BYTES || 8 * 1024 * 1024);
const ALLOWED_ORIGINS = new Set([
  'http://localhost',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1',
  'http://127.0.0.1:8000',
  'http://127.0.0.1:3000',
  'null',
]);

// Active User Sessions Store (token -> sessionInfo)
const activeSessions = new Map();

// Session expiry (24 hours)
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ── Helpers ─────────────────────────────────────────────────

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || 'null';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(origin) ? origin : 'http://localhost:8000');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const bodyStr = Buffer.concat(chunks).toString();
        const body = bodyStr ? JSON.parse(bodyStr) : {};
        resolve(body);
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeScreenshotFilename(filename) {
  const base = path.basename(String(filename || '')).replace(/[^a-z0-9._-]/gi, '_');
  if (!/^[a-z0-9][a-z0-9._-]{2,160}\.(png|jpe?g|webp)$/i.test(base)) {
    return null;
  }
  return base;
}

function isSupportedImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > MAX_BODY_BYTES) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isWebp;
}

function stripBase64Prefix(dataUrl) {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex !== -1 ? dataUrl.substring(commaIndex + 1) : dataUrl;
}

// ── Auth Gates ──────────────────────────────────────────────

async function verifyAdminAuth(req) {
  let authHeader = req.headers['authorization'];
  if (!authHeader) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const authParam = urlObj.searchParams.get('auth');
      if (authParam) {
        authHeader = 'Basic ' + authParam;
      }
    } catch (e) {}
  }
  if (!authHeader || !authHeader.startsWith('Basic ')) return null;
  const base64Creds = authHeader.substring(6);
  try {
    const creds = Buffer.from(base64Creds, 'base64').toString('ascii');
    const [username, password] = creds.split(':');
    const admin = await db.admins.findByUsername(username);
    if (!admin || !admin.active) return null;
    
    const isValid = bcrypt.compareSync(password, admin.password_hash);
    return isValid ? admin : null;
  } catch (err) {
    return null;
  }
}

function getSessionUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

// ── HTTP Server ─────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const url = parsedUrl.pathname;

  try {
    // ── PUBLIC / HEALTH ───────────────────────────────────────
    if (req.method === 'GET' && url === '/api/health') {
      return jsonResponse(res, 200, {
        success: true,
        status: 'healthy',
        database: db.usePostgres ? 'postgresql' : 'json-local',
        storage: storage.useSupabaseStorage ? 'supabase' : 'filesystem',
        uptime: process.uptime()
      });
    }

    if (req.method === 'GET' && url === '/api/apk/version') {
      const activeApk = await db.apkVersions.getActive();
      if (!activeApk) {
        return jsonResponse(res, 404, { success: false, error: 'No active APK version configured.' });
      }
      return jsonResponse(res, 200, { success: true, apk: activeApk });
    }

    if (req.method === 'GET' && url === '/api/leaderboard') {
      try {
        const localDb = db.localDb;
        let leaders = [];
        if (db.usePostgres) {
          const q = `
            SELECT 
              u.username AS name,
              t.mode AS mode,
              SUM(COALESCE(mr.kills, 0))::int AS kills,
              COUNT(CASE WHEN mr.rank = 1 OR mr.booyah = true THEN 1 END)::int AS wins
            FROM users u
            JOIN match_results mr ON u.id = mr.user_id
            JOIN tournaments t ON mr.tournament_id = t.id
            WHERE mr.status = 'Approved'
            GROUP BY u.username, t.mode
          `;
          const resRows = await db.query(q);
          leaders = resRows.rows.map(row => {
            const kills = Number(row.kills || 0);
            const wins = Number(row.wins || 0);
            const points = (kills * 10) + (wins * 100);
            return {
              name: row.name,
              mode: row.mode || 'Solo',
              kills,
              wins,
              points
            };
          });
        } else {
          const matchResults = localDb.match_results || [];
          const users = localDb.users || [];
          const tournaments = localDb.tournaments || [];
          const statsMap = {};
          
          matchResults.forEach(mr => {
            if (mr.status !== 'Approved') return;
            const u = users.find(x => x.id === mr.user_id);
            const t = tournaments.find(x => x.id === mr.tournament_id);
            if (!u || !t) return;
            
            const key = `${u.username}_${t.mode}`;
            if (!statsMap[key]) {
              statsMap[key] = {
                name: u.username,
                mode: t.mode,
                kills: 0,
                wins: 0
              };
            }
            statsMap[key].kills += Number(mr.kills || 0);
            if (mr.rank === 1 || mr.booyah) {
              statsMap[key].wins += 1;
            }
          });
          
          leaders = Object.values(statsMap).map(item => {
            return {
              name: item.name,
              mode: item.mode,
              kills: item.kills,
              wins: item.wins,
              points: (item.kills * 10) + (item.wins * 100)
            };
          });
        }
        
        // Populate default values using actual database users to ensure leaderboard is never empty
        const allUsers = db.usePostgres 
          ? (await db.query('SELECT username FROM users')).rows.map(r => r.username)
          : (localDb.users || []).map(u => u.username);
          
        allUsers.forEach(username => {
          ['Solo', 'Squad'].forEach(mode => {
            const exists = leaders.some(l => l.name === username && l.mode === mode);
            if (!exists) {
              leaders.push({
                name: username,
                mode: mode,
                kills: 0,
                wins: 0,
                points: 0
              });
            }
          });
        });

        leaders.sort((a, b) => b.points - a.points);
        return jsonResponse(res, 200, { success: true, leaders });
      } catch (err) {
        console.error('[Leaderboard API Error]', err);
        return jsonResponse(res, 500, { success: false, error: 'Internal server error' });
      }
    }

    if (req.method === 'GET' && url === '/api/winners') {
      try {
        const localDb = db.localDb;
        let winners = [];
        if (db.usePostgres) {
          const q = `
            SELECT 
              u.username AS name,
              t.title AS tournament,
              p.winnings::int AS prize,
              COALESCE(t.completed_at, t.created_at) AS date
            FROM participants p
            JOIN users u ON p.user_id = u.id
            JOIN tournaments t ON p.tournament_id = t.id
            WHERE p.winnings > 0
            ORDER BY date DESC
            LIMIT 10
          `;
          const resRows = await db.query(q);
          winners = resRows.rows.map(row => ({
            name: row.name,
            tournament: row.tournament,
            prize: Number(row.prize),
            date: row.date ? new Date(row.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
          }));
        } else {
          const participants = localDb.participants || [];
          const users = localDb.users || [];
          const tournaments = localDb.tournaments || [];
          
          winners = participants
            .filter(p => Number(p.winnings) > 0)
            .map(p => {
              const u = users.find(x => x.id === p.user_id);
              const t = tournaments.find(x => x.id === p.tournament_id);
              return {
                name: u ? u.username : 'Unknown',
                tournament: t ? t.title : 'Tournament',
                prize: Number(p.winnings),
                date: t ? (t.completed_at || t.created_at || new Date().toISOString()).split('T')[0] : new Date().toISOString().split('T')[0]
              };
            });
            
          winners.sort((a, b) => new Date(b.date) - new Date(a.date));
          winners = winners.slice(0, 10);
        }
        return jsonResponse(res, 200, { success: true, winners });
      } catch (err) {
        console.error('[Winners API Error]', err);
        return jsonResponse(res, 500, { success: false, error: 'Internal server error' });
      }
    }

    // ── PLAYER AUTHENTICATION ─────────────────────────────────

    if (req.method === 'POST' && url === '/api/auth/register') {
      const body = await readBody(req);
      const { username, email, password, phone, freeFireUid, freeFireUsername } = body;

      if (!username || !email || !password || !phone || !freeFireUid || !freeFireUsername) {
        return jsonResponse(res, 400, { success: false, error: 'Missing required registration fields.' });
      }
      if (password.length < 8) {
        return jsonResponse(res, 400, { success: false, error: 'Password must be at least 8 characters long.' });
      }

      // Check unique constraints
      const exUser = await db.users.findByUsername(username);
      if (exUser) return jsonResponse(res, 400, { success: false, error: 'Username is already taken.' });

      const exEmail = await db.users.findByEmail(email);
      if (exEmail) return jsonResponse(res, 400, { success: false, error: 'Email is already registered.' });

      const exFf = await db.users.findByFreeFireUid(freeFireUid);
      if (exFf) return jsonResponse(res, 400, { success: false, error: 'Free Fire UID is already registered.' });

      const passHash = bcrypt.hashSync(password, 10);
      const userId = `USR${100 + (db.usePostgres ? Date.now() % 100000 : (await db.users.list()).length + 2)}`;

      await db.users.create({
        id: userId,
        username,
        email,
        password_hash: passHash,
        phone,
        free_fire_uid: freeFireUid,
        free_fire_username: freeFireUsername
      });

      await db.wallets.create({
        user_id: userId,
        balance: 0.00,
        frozen: false,
        withdrawals_blocked: false
      });

      console.log(`[AUTH] Registered new player user: ${username} (${userId})`);
      return jsonResponse(res, 200, { success: true, message: 'Registration successful.' });
    }

    if (req.method === 'POST' && url === '/api/auth/login') {
      const body = await readBody(req);
      const { username, password } = body;

      if (!username || !password) {
        return jsonResponse(res, 400, { success: false, error: 'Username and password required.' });
      }

      const user = await db.users.findByUsername(username);
      if (!user) {
        return jsonResponse(res, 401, { success: false, error: 'Invalid username or password.' });
      }

      // Check hybrid transparent hash migration fallback
      if (user.sha256_hash_fallback) {
        const inputSha = crypto.createHash('sha256').update(password).digest('hex');
        if (inputSha === user.sha256_hash_fallback) {
          // Transparent upgrade
          const secureBcrypt = bcrypt.hashSync(password, 10);
          await db.users.update(user.id, {
            password_hash: secureBcrypt,
            sha256_hash_fallback: null
          });
          console.log(`[AUTH] Transparently upgraded credentials to bcrypt for: ${username}`);
          user.password_hash = secureBcrypt;
        } else {
          return jsonResponse(res, 401, { success: false, error: 'Invalid username or password.' });
        }
      } else {
        const isMatch = bcrypt.compareSync(password, user.password_hash);
        if (!isMatch) {
          return jsonResponse(res, 401, { success: false, error: 'Invalid username or password.' });
        }
      }

      // Generate session token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const sessionInfo = {
        userId: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        freeFireUid: user.free_fire_uid,
        freeFireUsername: user.free_fire_username,
        forcePasswordReset: user.force_password_reset,
        expiresAt: Date.now() + SESSION_EXPIRY_MS
      };
      activeSessions.set(sessionToken, sessionInfo);

      console.log(`[AUTH] Login success for user: ${username} (${user.id})`);
      return jsonResponse(res, 200, {
        success: true,
        sessionToken,
        user: {
          id: user.id,
          name: user.username,
          email: user.email,
          phone: user.phone,
          freeFireUid: user.free_fire_uid,
          freeFireUsername: user.free_fire_username,
          forcePasswordReset: user.force_password_reset
        }
      });
    }

    if (req.method === 'POST' && url === '/api/auth/reset-token') {
      const body = await readBody(req);
      const { username, email } = body;
      const user = await db.users.findByUsername(username);
      if (!user || user.email.toLowerCase() !== email.toLowerCase()) {
        return jsonResponse(res, 400, { success: false, error: 'Username and email combination not found.' });
      }

      const token = String(Math.floor(100000 + Math.random() * 900000));
      const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 mins
      await db.users.update(user.id, {
        reset_token: token,
        reset_expires: expires
      });

      console.log(`[RESET] Generated reset token for ${username}: ${token}`);
      return jsonResponse(res, 200, {
        success: true,
        message: 'Token generated successfully.',
        // In local beta development, we return the token in the API response so they can see it in console/network logs,
        // mitigating smtp limits.
        token: token
      });
    }

    if (req.method === 'POST' && url === '/api/auth/reset-password') {
      const body = await readBody(req);
      const { username, email, token, newPassword } = body;

      const user = await db.users.findByUsername(username);
      if (!user || user.email.toLowerCase() !== email.toLowerCase()) {
        return jsonResponse(res, 400, { success: false, error: 'User context mismatch.' });
      }

      if (user.reset_token !== token || new Date() > new Date(user.reset_expires)) {
        return jsonResponse(res, 400, { success: false, error: 'Invalid or expired verification token.' });
      }

      if (newPassword.length < 8) {
        return jsonResponse(res, 400, { success: false, error: 'Password must be at least 8 characters long.' });
      }

      const secureBcrypt = bcrypt.hashSync(newPassword, 10);
      await db.users.update(user.id, {
        password_hash: secureBcrypt,
        reset_token: null,
        reset_expires: null,
        force_password_reset: false
      });

      console.log(`[RESET] Updated password for user: ${username}`);
      return jsonResponse(res, 200, { success: true, message: 'Password updated successfully.' });
    }

    if (req.method === 'POST' && url === '/api/auth/logout') {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        activeSessions.delete(token);
      }
      return jsonResponse(res, 200, { success: true, message: 'Logged out successfully.' });
    }

    // ── SECURE USER PROFILE & WALLET OPERATIONS ──────────────────────────────
    const session = getSessionUser(req);
    if (!session && url.startsWith('/api/') && !url.startsWith('/api/admin/') && url !== '/api/payment' && url !== '/api/screenshot') {
      return jsonResponse(res, 401, { success: false, error: 'Unauthorized user session.' });
    }

    if (req.method === 'GET' && url === '/api/auth/session') {
      const user = await db.users.findById(session.userId);
      const wallet = await db.wallets.get(session.userId);
      return jsonResponse(res, 200, {
        success: true,
        user: {
          id: user.id,
          name: user.username,
          email: user.email,
          phone: user.phone,
          freeFireUid: user.free_fire_uid,
          freeFireUsername: user.free_fire_username
        },
        wallet: wallet ? wallet.balance : 0,
        frozen: wallet ? wallet.frozen : false,
        withdrawalsBlocked: wallet ? wallet.withdrawals_blocked : false
      });
    }

    if (req.method === 'GET' && url === '/api/wallet') {
      const wallet = await db.wallets.get(session.userId);
      return jsonResponse(res, 200, { success: true, wallet });
    }

    if (req.method === 'GET' && url === '/api/wallet/history') {
      const history = await db.transactions.list(session.userId);
      return jsonResponse(res, 200, { success: true, ledger: history });
    }

    if (req.method === 'POST' && url === '/api/wallet/withdraw') {
      const body = await readBody(req);
      const { amount, upiId } = body;

      if (!amount || amount < 50 || !upiId) {
        return jsonResponse(res, 400, { success: false, error: 'Minimum withdrawal amount is 50 INR. Valid UPI ID is required.' });
      }

      const wallet = await db.wallets.get(session.userId);
      if (wallet.frozen || wallet.withdrawals_blocked) {
        return jsonResponse(res, 403, { success: false, error: 'Withdrawals are currently blocked for this wallet.' });
      }

      if (wallet.balance < amount) {
        return jsonResponse(res, 400, { success: false, error: 'Insufficient wallet balance.' });
      }

      // Record withdrawal request in database
      const wId = await db.withdrawals.create({
        user_id: session.userId,
        amount: Number(amount),
        upi_id: upiId,
        status: 'Pending Verification',
        admin_notes: 'UPI payout request'
      });

      // Debit wallet immediately
      const newBal = Number(wallet.balance) - Number(amount);
      await db.wallets.update(session.userId, { balance: newBal });

      const auditId = await db.auditLogs.create({
        adminUsername: null,
        action: `User ${session.username} filed withdrawal request for ${amount} INR to UPI: ${upiId}.`
      });

      await db.transactions.create({
        user_id: session.userId,
        type: 'debit',
        label: `Withdrawal request #${wId}`,
        amount: Number(amount),
        actor: 'User',
        audit_id: auditId
      });

      return jsonResponse(res, 200, { success: true, message: 'Withdrawal request submitted successfully.', balance: newBal });
    }

    // ── TOURNAMENTS (PLAYER ACTIONS) ──────────────────────────
    if (req.method === 'GET' && url === '/api/tournaments') {
      const list = await db.tournaments.list();
      // Embed user join statuses
      const enriched = await Promise.all(list.map(async (t) => {
        const parts = await db.participants.listByTournament(t.id);
        const userPart = parts.find(p => p.user_id === session.userId);
        return {
          ...t,
          joined: !!userPart,
          joinedStatus: userPart ? userPart.status : null,
          participants: parts.map(p => ({
            userId: p.user_id,
            userName: p.username,
            joinedAt: p.joined_at,
            status: p.status,
            checkedIn: p.checked_in
          }))
        };
      }));
      return jsonResponse(res, 200, { success: true, tournaments: enriched });
    }

    if (req.method === 'POST' && url === '/api/tournaments/join') {
      const body = await readBody(req);
      const { tournamentId } = body;

      const t = await db.tournaments.findById(tournamentId);
      if (!t) return jsonResponse(res, 404, { success: false, error: 'Tournament not found.' });

      if (t.status !== 'registration_open') {
        return jsonResponse(res, 400, { success: false, error: 'Tournament registration is closed.' });
      }

      if (t.filled_slots >= t.player_limit) {
        return jsonResponse(res, 400, { success: false, error: 'Tournament is full.' });
      }

      const existingPart = await db.participants.find(tournamentId, session.userId);
      if (existingPart) {
        return jsonResponse(res, 400, { success: false, error: 'Already joined this tournament.' });
      }

      const user = await db.users.findById(session.userId);
      if (user.is_banned) {
        return jsonResponse(res, 403, { success: false, error: 'You are banned from tournament registration.' });
      }

      const wallet = await db.wallets.get(session.userId);
      const fee = Number(t.entry_fee);
      if (wallet.balance < fee) {
        return jsonResponse(res, 400, { success: false, error: 'Insufficient wallet balance to join.' });
      }

      // Deduct entry fee
      const newBal = Number(wallet.balance) - fee;
      await db.wallets.update(session.userId, { balance: newBal });

      // Add participant
      await db.participants.create({
        tournament_id: tournamentId,
        user_id: session.userId,
        status: 'approved', // Auto approved once balance is successfully charged
        checked_in: false,
        refunded: false,
        winnings: 0.00
      });

      // Increment filled slots
      await db.tournaments.update(tournamentId, { filled_slots: t.filled_slots + 1 });

      const auditId = await db.auditLogs.create({
        adminUsername: null,
        action: `User ${session.username} registered for tournament ${t.title}. Entry fee ${fee} INR charged.`
      });

      await db.transactions.create({
        user_id: session.userId,
        type: 'debit',
        label: `Tournament entry: ${t.title}`,
        amount: fee,
        actor: 'System',
        audit_id: auditId
      });

      console.log(`[LOBBY] User ${session.username} joined tournament ${tournamentId}`);
      return jsonResponse(res, 200, { success: true, message: 'Joined tournament successfully.', balance: newBal });
    }

    if (req.method === 'POST' && url === '/api/tournaments/result') {
      const body = await readBody(req);
      const { tournamentId, kills, rank, booyah, screenshotFilename, screenshotData } = body;

      if (!tournamentId || !screenshotFilename || !screenshotData) {
        return jsonResponse(res, 400, { success: false, error: 'Missing required results fields.' });
      }

      const safeName = sanitizeScreenshotFilename(screenshotFilename);
      if (!safeName) return jsonResponse(res, 400, { success: false, error: 'Invalid screenshot file type.' });

      const base64 = stripBase64Prefix(screenshotData);
      const buffer = Buffer.from(base64, 'base64');
      if (!isSupportedImage(buffer)) {
        return jsonResponse(res, 400, { success: false, error: 'Screenshot must be a valid image file.' });
      }

      const hash = crypto.createHash('sha256').update(base64).digest('hex');

      // Upload via storage controller
      await storage.uploadFile('Pending', safeName, buffer, 'image/jpeg');

      // Record result entry
      await db.matchResults.create({
        tournament_id: Number(tournamentId),
        user_id: session.userId,
        screenshot_filename: safeName,
        screenshot_hash: hash,
        kills: Number(kills || 0),
        rank: Number(rank || 1),
        booyah: !!booyah
      });

      await db.auditLogs.create({
        adminUsername: null,
        action: `Player ${session.username} submitted match results for tournament #${tournamentId}.`
      });

      return jsonResponse(res, 200, { success: true, message: 'Match results submitted for verification.' });
    }

    if (req.method === 'GET' && url === '/api/notifications') {
      const notificationsList = await db.notifications.listByUser(session.userId);
      // Mark read automatically on fetch
      await db.notifications.markAsRead(session.userId);
      return jsonResponse(res, 200, { success: true, notifications: notificationsList });
    }

    // ── ADMINISTRATIVE OPERATIONS (Basic Auth Protected) ─────────────────────
    const adminAccount = await verifyAdminAuth(req);
    if (!adminAccount && url.startsWith('/api/admin/')) {
      return jsonResponse(res, 401, { success: false, error: 'Unauthorized administrative session.' });
    }

    if (req.method === 'GET' && url === '/api/admin/users') {
      const userList = await db.users.list();
      const enriched = await Promise.all(userList.map(async (u) => {
        const wallet = await db.wallets.get(u.id);
        return {
          id: u.id,
          username: u.username,
          email: u.email,
          phone: u.phone,
          freeFireUid: u.free_fire_uid,
          freeFireUsername: u.free_fire_username,
          isBanned: u.is_banned,
          wallet: wallet ? wallet.balance : 0,
          frozen: wallet ? wallet.frozen : false,
          withdrawalsBlocked: wallet ? wallet.withdrawals_blocked : false,
          fraudFlags: u.fraud_flags,
          banHistory: u.ban_history,
          totalTournaments: u.total_tournaments || 0,
          totalWinnings: u.total_winnings || 0,
          totalWithdrawals: u.total_withdrawals || 0,
          rejectedResults: u.rejected_results || 0
        };
      }));
      return jsonResponse(res, 200, { success: true, users: enriched });
    }

    if (req.method === 'POST' && url === '/api/admin/users/status') {
      const body = await readBody(req);
      const { userId, frozen, withdrawalsBlocked, isBanned } = body;

      if (!userId) return jsonResponse(res, 400, { success: false, error: 'Missing userId parameter.' });

      const updates = {};
      if (frozen !== undefined) updates.frozen = !!frozen;
      if (withdrawalsBlocked !== undefined) updates.withdrawals_blocked = !!withdrawalsBlocked;

      if (Object.keys(updates).length > 0) {
        await db.wallets.update(userId, updates);
      }

      if (isBanned !== undefined) {
        const u = await db.users.findById(userId);
        if (u) {
          const bh = u.ban_history || [];
          bh.push(`${isBanned ? 'Banned' : 'Unbanned'} on ${new Date().toISOString()} by admin ${adminAccount.username}`);
          await db.users.update(userId, { is_banned: !!isBanned, ban_history: bh });
        }
      }

      await db.auditLogs.create({
        adminUsername: adminAccount.username,
        action: `Updated player controls for user ${userId} (Frozen: ${frozen}, Blocked: ${withdrawalsBlocked}, Banned: ${isBanned}).`
      });

      return jsonResponse(res, 200, { success: true, message: 'User status updated.' });
    }

    if (req.method === 'POST' && url === '/api/admin/credit') {
      const body = await readBody(req);
      const { userId, amount, label } = body;

      if (!userId || !amount || amount <= 0) {
        return jsonResponse(res, 400, { success: false, error: 'Valid userId and positive amount are required.' });
      }

      const wallet = await db.wallets.get(userId);
      if (!wallet) return jsonResponse(res, 404, { success: false, error: 'User wallet not found.' });

      const newBal = Number(wallet.balance) + Number(amount);
      await db.wallets.update(userId, { balance: newBal });

      const auditId = await db.auditLogs.create({
        adminUsername: adminAccount.username,
        action: `Admin credited ${amount} INR to user ${userId} for: ${label || 'Correction'}.`
      });

      await db.transactions.create({
        user_id: userId,
        type: 'credit',
        label: label || 'Admin credit',
        amount: Number(amount),
        actor: 'Admin',
        audit_id: auditId
      });

      await db.notifications.create({
        user_id: userId,
        title: 'Wallet Credited',
        message: `Your wallet was credited with ${amount} INR for: ${label || 'Correction'}.`
      });

      return jsonResponse(res, 200, { success: true, message: 'Wallet credited successfully.' });
    }

    if (req.method === 'POST' && url === '/api/admin/debit') {
      const body = await readBody(req);
      const { userId, amount, label } = body;

      if (!userId || !amount || amount <= 0) {
        return jsonResponse(res, 400, { success: false, error: 'Valid userId and positive amount are required.' });
      }

      const wallet = await db.wallets.get(userId);
      if (!wallet) return jsonResponse(res, 404, { success: false, error: 'User wallet not found.' });

      if (wallet.balance < amount) {
        return jsonResponse(res, 400, { success: false, error: 'Insufficient wallet balance for debit.' });
      }

      const newBal = Number(wallet.balance) - Number(amount);
      await db.wallets.update(userId, { balance: newBal });

      const auditId = await db.auditLogs.create({
        adminUsername: adminAccount.username,
        action: `Admin debited ${amount} INR from user ${userId} for: ${label || 'Correction'}.`
      });

      await db.transactions.create({
        user_id: userId,
        type: 'debit',
        label: label || 'Admin debit',
        amount: Number(amount),
        actor: 'Admin',
        audit_id: auditId
      });

      await db.notifications.create({
        user_id: userId,
        title: 'Wallet Debited',
        message: `Your wallet was debited with ${amount} INR for: ${label || 'Correction'}.`
      });

      return jsonResponse(res, 200, { success: true, message: 'Wallet debited successfully.' });
    }

    if (req.method === 'GET' && url === '/api/admin/requests') {
      const withdrawalsList = await db.withdrawals.listAll();
      return jsonResponse(res, 200, { success: true, requests: withdrawalsList });
    }

    if (req.method === 'POST' && url === '/api/admin/requests/action') {
      const body = await readBody(req);
      const { withdrawalId, action, notes } = body;

      if (!withdrawalId || !action) {
        return jsonResponse(res, 400, { success: false, error: 'Missing withdrawalId or action.' });
      }

      const w = await db.withdrawals.findById(Number(withdrawalId));
      if (!w || w.status !== 'Pending Verification') {
        return jsonResponse(res, 404, { success: false, error: 'Pending withdrawal request not found.' });
      }

      const now = new Date().toISOString();
      if (action === 'approve') {
        await db.withdrawals.update(w.id, { status: 'Approved', reviewed_at: now, admin_notes: notes || 'Approved' });
        await db.auditLogs.create({
          adminUsername: adminAccount.username,
          action: `Approved withdrawal #${w.id} for user ${w.user_id} of ${w.amount} INR.`
        });
        await db.notifications.create({
          user_id: w.user_id,
          title: 'Withdrawal Approved',
          message: `Your withdrawal of ${w.amount} INR has been approved and processed.`
        });
      } else if (action === 'reject') {
        // Return money back to wallet
        const wallet = await db.wallets.get(w.user_id);
        const newBal = Number(wallet.balance) + Number(w.amount);
        await db.wallets.update(w.user_id, { balance: newBal });

        await db.withdrawals.update(w.id, { status: 'Rejected', reviewed_at: now, admin_notes: notes || 'Rejected' });

        const auditId = await db.auditLogs.create({
          adminUsername: adminAccount.username,
          action: `Rejected withdrawal #${w.id} for user ${w.user_id}. Returned ${w.amount} INR to wallet.`
        });

        await db.transactions.create({
          user_id: w.user_id,
          type: 'credit',
          label: `Refund rejected withdrawal #${w.id}`,
          amount: Number(w.amount),
          actor: 'System',
          audit_id: auditId
        });

        await db.notifications.create({
          user_id: w.user_id,
          title: 'Withdrawal Rejected',
          message: `Your withdrawal of ${w.amount} INR was rejected. Funds returned to your wallet.`
        });
      }

      return jsonResponse(res, 200, { success: true, message: `Request successfully ${action}d.` });
    }

    if (req.method === 'GET' && url === '/api/admin/audit') {
      const auditLogsList = await db.auditLogs.list();
      return jsonResponse(res, 200, { success: true, audit: auditLogsList });
    }

    if (req.method === 'GET' && url === '/api/admin/tournaments') {
      const list = await db.tournaments.list();
      return jsonResponse(res, 200, { success: true, tournaments: list });
    }

    if (req.method === 'POST' && url === '/api/admin/tournaments/status') {
      const body = await readBody(req);
      const { tournamentId, status, roomId, roomPassword, roomReleased } = body;

      if (!tournamentId) return jsonResponse(res, 400, { success: false, error: 'Missing tournamentId.' });

      const updates = {};
      if (status !== undefined) updates.status = status;
      if (roomId !== undefined) updates.room_id = roomId;
      if (roomPassword !== undefined) updates.room_password = roomPassword;
      if (roomReleased !== undefined) updates.room_released = !!roomReleased;

      await db.tournaments.update(Number(tournamentId), updates);

      const t = await db.tournaments.findById(Number(tournamentId));
      if (roomReleased) {
        // Send notification to all participants
        const parts = await db.participants.listByTournament(Number(tournamentId));
        for (const p of parts) {
          await db.notifications.create({
            user_id: p.user_id,
            title: 'Lobby Details Released',
            message: `Lobby room details for ${t.title} are now available! Room ID: ${roomId}, Pass: ${roomPassword}.`
          });
        }
      }

      await db.auditLogs.create({
        adminUsername: adminAccount.username,
        action: `Updated tournament #${tournamentId} (Status: ${status}, Room ID: ${roomId}).`
      });

      return jsonResponse(res, 200, { success: true, message: 'Tournament updated successfully.' });
    }

    if (req.method === 'GET' && url === '/api/admin/tournaments') {
      const list = await db.tournaments.list();
      const enriched = await Promise.all(list.map(async (t) => {
        const parts = await db.participants.listByTournament(t.id);
        const results = await db.matchResults.listByTournament(t.id);
        
        const resolvedResults = await Promise.all(results.map(async (r) => {
          let url = r.screenshot_filename;
          if (storage.useSupabaseStorage) {
            try {
              url = await storage.getSignedUrl('Results', r.screenshot_filename);
            } catch(e) {}
          } else {
            url = `http://localhost:${PORT}/api/screenshot?folder=Results&filename=${r.screenshot_filename}`;
          }
          return {
            participantId: r.user_id,
            userName: r.username || 'Unknown',
            kills: Number(r.kills),
            rank: Number(r.rank),
            booyahClaimed: !!r.booyah,
            proofScreenshot: url,
            proofStatus: r.status === 'Approved' ? 'approved' : r.status === 'Rejected' ? 'rejected' : 'pending',
            rewardPaid: r.status === 'Approved'
          };
        }));

        return {
          id: t.id,
          game: t.game,
          title: t.title,
          mode: t.mode,
          map: t.map,
          time: t.match_time,
          entryFee: Number(t.entry_fee),
          prize: Number(t.prize_pool),
          playerLimit: Number(t.player_limit),
          teamLimit: Number(t.team_limit),
          registration: t.registration,
          filledSlots: Number(t.filled_slots),
          perKill: Number(t.per_kill),
          booyah: Number(t.booyah),
          rewards: {
            perKill: Number(t.per_kill),
            booyah: Number(t.booyah),
            rank1: Number(t.rank1),
            rank2: Number(t.rank2),
            rank3: Number(t.rank3),
            rank4to10: Number(t.rank4to10),
            mvp: Number(t.mvp),
            specialRewards: t.special_rewards
          },
          status: t.status,
          roomId: t.room_id,
          roomPassword: t.room_password,
          roomReleased: !!t.room_released,
          participants: parts.map(p => ({
            userId: p.user_id,
            userName: p.username || 'Unknown',
            joinedAt: p.joined_at,
            status: p.status,
            checkedIn: !!p.checked_in
          })),
          results: resolvedResults
        };
      }));
      return jsonResponse(res, 200, { success: true, tournaments: enriched });
    }

    if (req.method === 'POST' && url === '/api/admin/tournaments') {
      const body = await readBody(req);
      const t = body;

      const newId = await db.tournaments.create({
        game: t.game,
        title: t.title,
        mode: t.mode,
        map: t.map,
        match_time: t.time || t.matchStartTime,
        entry_fee: Number(t.entryFee || t.entry || 0),
        prize_pool: Number(t.prize || t.prizePool || 0),
        player_limit: Number(t.playerLimit || t.totalSlots || 100),
        team_limit: Number(t.teamLimit || t.totalSlots || 100),
        registration: t.registration || 'Admin window',
        filled_slots: 0,
        per_kill: Number(t.perKill || 0),
        booyah: Number(t.booyah || 0),
        rank1: Number(t.rewards?.rank1 || t.rankRewards?.[0]?.amount || 0),
        rank2: Number(t.rewards?.rank2 || t.rankRewards?.[1]?.amount || 0),
        rank3: Number(t.rewards?.rank3 || t.rankRewards?.[2]?.amount || 0),
        rank4to10: Number(t.rewards?.rank4to10 || t.rankRewards?.[3]?.amount || 0),
        mvp: Number(t.rewards?.mvp || t.rankRewards?.[4]?.amount || 0),
        special_rewards: t.rewards?.specialRewards || t.specialRewards || 'None',
        status: 'upcoming'
      });

      await db.auditLogs.create({
        adminUsername: adminAccount.username,
        action: `Created new tournament: ${t.title} (${t.mode}, map: ${t.map})`
      });

      return jsonResponse(res, 200, { success: true, message: 'Tournament created successfully.', tournamentId: newId });
    }

    if (req.method === 'GET' && url === '/api/admin/participants') {
      const tId = parsedUrl.searchParams.get('tournamentId');
      if (!tId) return jsonResponse(res, 400, { success: false, error: 'Missing tournamentId query parameter.' });
      const parts = await db.participants.listByTournament(Number(tId));
      return jsonResponse(res, 200, { success: true, participants: parts });
    }

    if (req.method === 'POST' && url === '/api/admin/participants/action') {
      const body = await readBody(req);
      const { tournamentId, userId, action } = body;

      if (!tournamentId || !userId || !action) {
        return jsonResponse(res, 400, { success: false, error: 'Missing parameters.' });
      }

      const p = await db.participants.find(Number(tournamentId), userId);
      const t = await db.tournaments.findById(Number(tournamentId));

      if (!t) return jsonResponse(res, 404, { success: false, error: 'Tournament not found.' });

      if (action === 'approve') {
        if (p && p.status !== 'approved') {
          await db.participants.update(Number(tournamentId), userId, { status: 'approved' });
          const approvedCount = (await db.participants.listByTournament(Number(tournamentId))).filter(x => x.status === 'approved').length;
          await db.tournaments.update(Number(tournamentId), { filled_slots: approvedCount });
          await db.auditLogs.create({
            adminUsername: adminAccount.username,
            action: `Approved participant ${userId} for tournament ${t.title}.`
          });
        }
      } else if (action === 'delete') {
        if (p && !p.refunded) {
          const fee = Number(t.entry_fee);
          if (fee > 0) {
            const wallet = await db.wallets.get(userId);
            const newBal = Number(wallet.balance) + fee;
            await db.wallets.update(userId, { balance: newBal });

            const auditId = await db.auditLogs.create({
              adminUsername: adminAccount.username,
              action: `Refunded tournament entry fee of ${fee} INR to user ${userId} for ${t.title}.`
            });

            await db.transactions.create({
              user_id: userId,
              type: 'credit',
              label: `Refund tournament entry: ${t.title}`,
              amount: fee,
              actor: 'System',
              audit_id: auditId
            });

            await db.notifications.create({
              user_id: userId,
              title: 'Tournament Entry Refunded',
              message: `You were removed from ${t.title}. Entry fee of ${fee} INR has been refunded to your wallet.`
            });
          }
          await db.participants.delete(Number(tournamentId), userId);
          const approvedCount = (await db.participants.listByTournament(Number(tournamentId))).filter(x => x.status === 'approved').length;
          await db.tournaments.update(Number(tournamentId), { filled_slots: approvedCount });
        }
      } else if (action === 'refund') {
        if (p && !p.refunded) {
          const fee = Number(t.entry_fee);
          if (fee > 0) {
            const wallet = await db.wallets.get(userId);
            const newBal = Number(wallet.balance) + fee;
            await db.wallets.update(userId, { balance: newBal });

            const auditId = await db.auditLogs.create({
              adminUsername: adminAccount.username,
              action: `Refunded tournament entry fee of ${fee} INR to user ${userId} for ${t.title}.`
            });

            await db.transactions.create({
              user_id: userId,
              type: 'credit',
              label: `Refund tournament entry: ${t.title}`,
              amount: fee,
              actor: 'System',
              audit_id: auditId
            });

            await db.notifications.create({
              user_id: userId,
              title: 'Tournament Entry Refunded',
              message: `You were refunded from ${t.title}. Entry fee of ${fee} INR has been credited to your wallet.`
            });
          }
          await db.participants.update(Number(tournamentId), userId, { status: 'refunded', refunded: true });
          const approvedCount = (await db.participants.listByTournament(Number(tournamentId))).filter(x => x.status === 'approved').length;
          await db.tournaments.update(Number(tournamentId), { filled_slots: approvedCount });
        }
      } else if (action === 'disqualify') {
        if (p) {
          await db.participants.update(Number(tournamentId), userId, { status: 'disqualified' });
          const approvedCount = (await db.participants.listByTournament(Number(tournamentId))).filter(x => x.status === 'approved').length;
          await db.tournaments.update(Number(tournamentId), { filled_slots: approvedCount });

          const user = await db.users.findById(userId);
          if (user) {
            const flags = user.fraud_flags || [];
            flags.push(`Disqualified from ${t.title} on ${new Date().toISOString()}`);
            await db.users.update(userId, { fraud_flags: flags });
          }

          await db.auditLogs.create({
            adminUsername: adminAccount.username,
            action: `Disqualified participant ${userId} from tournament ${t.title}.`
          });
        }
      }

      return jsonResponse(res, 200, { success: true, message: 'Participant action processed.' });
    }

    if (req.method === 'POST' && url === '/api/admin/tournaments/result/action') {
      const body = await readBody(req);
      const { tournamentId, participantId, action } = body;

      if (!tournamentId || !participantId || !action) {
        return jsonResponse(res, 400, { success: false, error: 'Missing parameters.' });
      }

      const t = await db.tournaments.findById(Number(tournamentId));
      const mr = await db.matchResults.find(Number(tournamentId), participantId);

      if (!t || !mr) {
        return jsonResponse(res, 404, { success: false, error: 'Tournament or match result not found.' });
      }

      const now = new Date().toISOString();
      if (action === 'approve') {
        await db.matchResults.update(mr.id, { status: 'Approved', reviewed_at: now });
        await storage.moveFile('Pending', 'Approved', mr.screenshot_filename).catch(() => {});

        await db.auditLogs.create({
          adminUsername: adminAccount.username,
          action: `Approved match result for user ${participantId} in tournament ${t.title}.`
        });

        await db.notifications.create({
          user_id: participantId,
          title: 'Result Approved',
          message: `Your match result submission for ${t.title} has been approved.`
        });
      } else if (action === 'reject') {
        await db.matchResults.update(mr.id, { status: 'Rejected', reviewed_at: now });
        await storage.moveFile('Pending', 'Rejected', mr.screenshot_filename).catch(() => {});

        const u = await db.users.findById(participantId);
        if (u) {
          const rejectedCount = Number(u.rejected_results || 0) + 1;
          await db.users.update(participantId, { rejected_results: rejectedCount });
        }

        await db.auditLogs.create({
          adminUsername: adminAccount.username,
          action: `Rejected match result for user ${participantId} in tournament ${t.title}.`
        });

        await db.notifications.create({
          user_id: participantId,
          title: 'Result Rejected',
          message: `Your match result submission for ${t.title} was rejected by admin.`
        });
      }

      return jsonResponse(res, 200, { success: true, message: `Result ${action}d successfully.` });
    }

    if (req.method === 'POST' && url === '/api/admin/tournaments/rewards') {
      const body = await readBody(req);
      const { tournamentId } = body;

      if (!tournamentId) return jsonResponse(res, 400, { success: false, error: 'Missing tournamentId.' });

      const t = await db.tournaments.findById(Number(tournamentId));
      if (!t) return jsonResponse(res, 404, { success: false, error: 'Tournament not found.' });

      if (t.status === 'completed') {
        return jsonResponse(res, 400, { success: false, error: 'Rewards already distributed.' });
      }

      const results = await db.matchResults.listByTournament(Number(tournamentId));
      const approvedResults = results.filter(r => r.status === 'Approved');

      for (const r of approvedResults) {
        const p = await db.participants.find(Number(tournamentId), r.user_id);
        if (p && Number(p.winnings) === 0) {
          let reward = 0;
          if (r.rank === 1) reward += Number(t.rank1 || 0);
          else if (r.rank === 2) reward += Number(t.rank2 || 0);
          else if (r.rank === 3) reward += Number(t.rank3 || 0);
          else if (r.rank >= 4 && r.rank <= 10) reward += Number(t.rank4to10 || 0);
          
          reward += Number(r.kills || 0) * Number(t.per_kill || 0);
          if (r.booyah) reward += Number(t.booyah || 0);

          if (reward > 0) {
            await db.participants.update(Number(tournamentId), r.user_id, { winnings: reward });

            const wallet = await db.wallets.get(r.user_id);
            const newBal = Number(wallet.balance) + reward;
            await db.wallets.update(r.user_id, { balance: newBal });

            const u = await db.users.findById(r.user_id);
            if (u) {
              const newWins = Number(u.total_winnings || 0) + reward;
              const newTours = Number(u.total_tournaments || 0) + 1;
              await db.users.update(r.user_id, { total_winnings: newWins, total_tournaments: newTours });
            }

            const auditId = await db.auditLogs.create({
              adminUsername: adminAccount.username,
              action: `Distributed reward of ${reward} INR to user ${r.user_id} for tournament ${t.title}.`
            });

            await db.transactions.create({
              user_id: r.user_id,
              type: 'credit',
              label: `Winnings: ${t.title}`,
              amount: reward,
              actor: 'System',
              audit_id: auditId
            });

            await db.notifications.create({
              user_id: r.user_id,
              title: 'Tournament Reward Credited',
              message: `Congratulations! You won ${reward} INR in tournament ${t.title}. Your wallet has been credited.`
            });
          }
        }
      }

      await db.tournaments.update(Number(tournamentId), { status: 'completed', completed_at: new Date().toISOString() });

      await db.auditLogs.create({
        adminUsername: adminAccount.username,
        action: `Rewards approved and distributed for tournament ${t.title}. Tournament completed.`
      });

      return jsonResponse(res, 200, { success: true, message: 'Rewards distributed and tournament completed.' });
    }

    // ── SCREENSHOT RETRIEVAL & SIGNING ────────────────────────
    if (req.method === 'GET' && url === '/api/screenshot') {
      const folder = parsedUrl.searchParams.get('folder');
      const filename = parsedUrl.searchParams.get('filename');
      const reqUserId = parsedUrl.searchParams.get('userId');

      if (!folder || !filename) {
        return jsonResponse(res, 400, { success: false, error: 'Missing folder or filename.' });
      }

      const safeName = sanitizeScreenshotFilename(filename);
      if (!safeName) return jsonResponse(res, 400, { success: false, error: 'Invalid filename.' });

      // Gated access control:
      // must be admin, or session userId must match file userId
      const parts = safeName.split('_');
      const fileUserId = parts.length >= 2 ? parts[1] : '';

      const isAdmin = !!adminAccount;
      const isOwner = session && session.userId === fileUserId;

      if (!isAdmin && !isOwner && reqUserId !== fileUserId) {
        console.warn(`[SCREENSHOT] Unauthorized access attempt to file: ${safeName}`);
        return jsonResponse(res, 403, { success: false, error: 'Forbidden. Unauthorized screenshot access.' });
      }

      // Check if we are running in Supabase Storage mode or filesystem mode
      if (storage.useSupabaseStorage) {
        try {
          const signedUrl = await storage.getSignedUrl(folder, safeName);
          res.writeHead(302, { 'Location': signedUrl });
          return res.end();
        } catch (err) {
          return jsonResponse(res, 500, { success: false, error: `Failed to fetch signed URL: ${err.message}` });
        }
      } else {
        const filePath = path.join(BASE_DIR, folder, safeName);
        if (!fs.existsSync(filePath)) {
          return jsonResponse(res, 404, { success: false, error: 'File not found on local disk.' });
        }

        const ext = path.extname(filePath).toLowerCase();
        let mime = 'image/jpeg';
        if (ext === '.png') mime = 'image/png';
        else if (ext === '.webp') mime = 'image/webp';

        res.writeHead(200, { 'Content-Type': mime });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // ── DEPOSITS HANDLERS (BACKWARDS COMPATIBILITY) ───────────
    if (req.method === 'GET' && url === '/api/payments') {
      const isAdmin = !!adminAccount;
      const reqUserId = parsedUrl.searchParams.get('userId');

      if (!isAdmin && (!session || session.userId !== reqUserId)) {
        return jsonResponse(res, 401, { success: false, error: 'Unauthorized.' });
      }

      const list = isAdmin ? await db.paymentRequests.listAll() : await db.paymentRequests.listByUser(session.userId);
      
      // If Supabase Storage is active, resolve signed URL for screenshots on list retrieve
      const resolvedList = await Promise.all(list.map(async (pr) => {
        let url = pr.screenshot_filename;
        if (storage.useSupabaseStorage) {
          try {
            url = await storage.getSignedUrl(pr.status === 'Approved' ? 'Approved' : pr.status === 'Rejected' ? 'Rejected' : 'Pending', pr.screenshot_filename);
          } catch(e) {}
        } else {
          url = `http://localhost:${PORT}/api/screenshot?folder=${pr.status === 'Approved' ? 'Approved' : pr.status === 'Rejected' ? 'Rejected' : 'Pending'}&filename=${pr.screenshot_filename}`;
        }
        return {
          ...pr,
          screenshotUrl: url
        };
      }));

      return jsonResponse(res, 200, { success: true, payments: resolvedList });
    }

    if (req.method === 'POST' && url === '/api/payment') {
      const body = await readBody(req);
      const { action, data } = body;

      if (!action || !data) {
        return jsonResponse(res, 400, { success: false, error: 'Missing action or data.' });
      }

      // Authorize administrators for approve / reject actions
      if ((action === 'approve' || action === 'reject') && !adminAccount) {
        return jsonResponse(res, 401, { success: false, error: 'Unauthorized administrative operation.' });
      }

      if (action === 'submit') {
        const { requestId, userId, amount, utrNumber, screenshotFilename, screenshotData, duplicateFlags = [] } = data;
        if (!screenshotFilename || !screenshotData || !utrNumber) {
          return jsonResponse(res, 400, { success: false, error: 'Missing UTR number or screenshot file.' });
        }

        const safeName = sanitizeScreenshotFilename(screenshotFilename);
        if (!safeName) return jsonResponse(res, 400, { success: false, error: 'Invalid filename.' });

        const base64 = stripBase64Prefix(screenshotData);
        const buffer = Buffer.from(base64, 'base64');
        if (!isSupportedImage(buffer)) {
          return jsonResponse(res, 400, { success: false, error: 'Supported image formats are JPG, PNG, WEBP.' });
        }

        const hash = crypto.createHash('sha256').update(base64).digest('hex');

        // Check unique UTR
        const exUtr = await db.paymentRequests.findByUtr(utrNumber);
        if (exUtr) return jsonResponse(res, 400, { success: false, error: 'This UTR has already been submitted.' });

        // Upload
        await storage.uploadFile('Pending', safeName, buffer, 'image/jpeg');

        // Create db record
        await db.paymentRequests.create({
          request_id: requestId,
          user_id: userId,
          amount: Number(amount),
          utr_number: utrNumber,
          screenshot_filename: safeName,
          screenshot_hash: hash,
          duplicate_flags: duplicateFlags
        });

        await db.auditLogs.create({
          adminUsername: null,
          action: `Payment verification request ${requestId} submitted by user ${userId} for ${amount} INR.`
        });

        return jsonResponse(res, 200, { success: true, message: 'Payment submitted successfully.', filename: safeName });
      }

      if (action === 'approve') {
        const adminNotes = data.adminNotes;
        const reqId = data.request_id || data.requestId;
        const pr = await db.paymentRequests.findById(reqId);
        if (!pr || pr.status !== 'Pending Verification') {
          return jsonResponse(res, 404, { success: false, error: 'Pending deposit request not found.' });
        }

        // Move storage file
        await storage.moveFile('Pending', 'Approved', pr.screenshot_filename);

        // Update record
        const now = new Date().toISOString();
        await db.paymentRequests.update(reqId, { status: 'Approved', reviewed_at: now, admin_notes: adminNotes || 'Approved' });

        // Credit user wallet
        const wallet = await db.wallets.get(pr.user_id);
        const newBal = Number(wallet.balance) + Number(pr.amount);
        await db.wallets.update(pr.user_id, { balance: newBal });

        const auditId = await db.auditLogs.create({
          adminUsername: adminAccount.username,
          action: `Approved deposit request ${reqId} for user ${pr.user_id} of ${pr.amount} INR. UTR: ${pr.utr_number}.`
        });

        await db.transactions.create({
          user_id: pr.user_id,
          type: 'credit',
          label: `Approved deposit: ${reqId}`,
          amount: Number(pr.amount),
          actor: 'Admin',
          audit_id: auditId
        });

        await db.notifications.create({
          user_id: pr.user_id,
          title: 'Deposit Approved',
          message: `Your deposit request ${reqId} of ${pr.amount} INR was approved and credited to your wallet.`
        });

        return jsonResponse(res, 200, { success: true, message: 'Deposit approved successfully.' });
      }

      if (action === 'reject') {
        const adminNotes = data.adminNotes;
        const reqId = data.request_id || data.requestId;
        const pr = await db.paymentRequests.findById(reqId);
        if (!pr || pr.status !== 'Pending Verification') {
          return jsonResponse(res, 404, { success: false, error: 'Pending deposit request not found.' });
        }

        // Move storage file
        await storage.moveFile('Pending', 'Rejected', pr.screenshot_filename);

        const now = new Date().toISOString();
        await db.paymentRequests.update(reqId, { status: 'Rejected', reviewed_at: now, admin_notes: adminNotes || 'Rejected' });

        await db.auditLogs.create({
          adminUsername: adminAccount.username,
          action: `Rejected deposit request ${reqId} for user ${pr.user_id}. Reason: ${adminNotes || 'Rejection'}.`
        });

        await db.notifications.create({
          user_id: pr.user_id,
          title: 'Deposit Rejected',
          message: `Your deposit request ${reqId} was rejected. Reason: ${adminNotes || 'Declined'}.`
        });

        return jsonResponse(res, 200, { success: true, message: 'Deposit rejected successfully.' });
      }
    }

    if (req.method === 'GET' && url === '/api/admins') {
      const admin = await verifyAdminAuth(req);
      if (!admin) return jsonResponse(res, 401, { success: false, error: 'Unauthorized.' });
      const adminsList = await db.admins.list();
      return jsonResponse(res, 200, { success: true, admins: adminsList });
    }

    if (req.method === 'POST' && url === '/api/admins') {
      const admin = await verifyAdminAuth(req);
      if (!admin || admin.role !== 'super') {
        return jsonResponse(res, 403, { success: false, error: 'Forbidden. Super Admin permissions required.' });
      }

      const body = await readBody(req);
      if (Array.isArray(body)) {
        // Bulk import admins (during migration or updates)
        for (const item of body) {
          const exists = await db.admins.findByUsername(item.username);
          if (!exists) {
            await db.admins.create({
              id: item.id,
              username: item.username,
              password_hash: item.passwordHash.includes('$2a$') ? item.passwordHash : bcrypt.hashSync(Buffer.from(item.passwordHash, 'base64').toString('ascii'), 10),
              role: item.role,
              active: item.active
            });
          } else {
            await db.admins.update(exists.id, {
              password_hash: item.passwordHash.includes('$2a$') ? item.passwordHash : bcrypt.hashSync(Buffer.from(item.passwordHash, 'base64').toString('ascii'), 10),
              role: item.role,
              active: item.active
            });
          }
        }
        return jsonResponse(res, 200, { success: true, message: 'Admin records sync complete.' });
      }
    }

    // ── CATCH ALL 404 ─────────────────────────────────────────
    console.log(`[404] ${req.method} ${req.url}`);
    return jsonResponse(res, 404, { success: false, error: `Route not found: ${req.method} ${url}` });

  } catch (err) {
    console.error(`[SERVER ERROR] ${req.method} ${req.url}:`, err);
    return jsonResponse(res, 500, { success: false, error: `Internal Server Error: ${err.message}` });
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('============================================================');
  console.log(`  ArenaX Production Server running on http://localhost:${PORT}`);
  console.log('============================================================');
  console.log('');
});
