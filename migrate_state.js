/**
 * ArenaX Database Migration Utility
 * Imports exported browser localStorage JSON dumps into the database,
 * performs balance validations, and records audit trails.
 *
 * Usage:
 *   node migrate_state.js <localStorageDump.json>
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

async function migrate(filePath) {
  if (!filePath) {
    console.error('Error: Please provide the path to the localStorage export JSON file.');
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found at ${absolutePath}`);
    process.exit(1);
  }

  console.log(`[MIGRATION] Reading local data export from: ${absolutePath}`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (err) {
    console.error(`Error: Failed to parse JSON export: ${err.message}`);
    process.exit(1);
  }

  const { users = [], wallets = {}, state = {} } = data;

  console.log(`[MIGRATION] Found in export:`);
  console.log(`  - Users: ${users.length}`);
  console.log(`  - Wallets: ${Object.keys(wallets).length}`);
  console.log(`  - Tournaments: ${(state.tournaments || []).length}`);
  console.log(`  - Ledgers: ${(state.ledger || []).length}`);
  console.log(`  - Requests: ${(state.requests || []).length}`);
  console.log(`  - Payment Requests: ${(state.paymentRequests || []).length}`);

  console.log('\n[MIGRATION] Step 1: Performing Wallet & Transaction Integrity Audits...');
  
  // Integrity check: sum of ledgers must equal current balance for each user
  for (const userId of Object.keys(wallets)) {
    const wallet = wallets[userId];
    const userLedger = (state.ledger || []).filter(tx => tx.userId === userId);
    
    let computedBalance = 0;
    userLedger.forEach(tx => {
      if (tx.type === 'credit') {
        computedBalance += Number(tx.amount);
      } else if (tx.type === 'debit') {
        computedBalance -= Math.abs(Number(tx.amount));
      }
    });

    // Handle initial state defaults if ledger doesn't have it (e.g. RogueRavi starts with 420, bonus is 150, correction -30, reward 300 = 420)
    // RogueRavi: balance=420. Ledger: credit 150, debit -30, credit 300 = 420. Matches!
    const balanceDiff = Math.abs(computedBalance - Number(wallet.balance));
    if (balanceDiff > 0.01) {
      console.warn(`[INTEGRITY WARNING] User ${userId} wallet balance (${wallet.balance}) does not match transaction ledger delta (${computedBalance}). Diff: ${balanceDiff}`);
    } else {
      console.log(`[INTEGRITY OK] User ${userId} balance checksum verified.`);
    }
  }

  console.log('\n[MIGRATION] Step 2: Migrating Users & Wallets...');
  for (const u of users) {
    const existingUser = await db.users.findById(u.id);
    if (existingUser) {
      console.log(`  - User ${u.username} (${u.id}) already exists in DB. Skipping user creation.`);
      continue;
    }

    // Secure password conversion:
    // We store the client-side SHA-256 hash in sha256_hash_fallback
    // We generate a secure random bcrypt hash as the primary password_hash
    const randomPassword = require('crypto').randomBytes(32).toString('hex');
    const secureBcrypt = bcrypt.hashSync(randomPassword, 10);

    const profile = (state.playerProfiles || {})[u.id] || {
      totalTournaments: 0,
      totalWinnings: 0,
      totalWithdrawals: 0,
      rejectedResults: 0,
      fraudFlags: [],
      banHistory: [],
      isBanned: false
    };

    await db.users.create({
      id: u.id,
      username: u.username,
      email: u.email,
      password_hash: secureBcrypt,
      sha256_hash_fallback: u.passwordHash, // Old SHA-256 hash
      phone: u.phone,
      free_fire_uid: u.free_fire_uid || u.freeFireUid || '',
      free_fire_username: u.free_fire_username || u.freeFireUsername || '',
      force_password_reset: u.forcePasswordReset || false,
      is_banned: profile.isBanned || false,
      total_tournaments: profile.totalTournaments || 0,
      total_winnings: profile.totalWinnings || 0,
      total_withdrawals: profile.totalWithdrawals || 0,
      rejected_results: profile.rejectedResults || 0,
      fraud_flags: profile.fraudFlags || [],
      ban_history: profile.banHistory || [],
      created_at: u.createdAt || new Date().toISOString()
    });

    // Create corresponding wallet
    const w = wallets[u.id] || { balance: 0.00, frozen: false, withdrawalsBlocked: false };
    await db.wallets.create({
      user_id: u.id,
      balance: Number(w.balance || 0.00),
      frozen: !!w.frozen,
      withdrawals_blocked: !!w.withdrawalsBlocked
    });

    console.log(`  - Created User ${u.username} (${u.id}) and initialized wallet: ${w.balance} INR.`);
  }

  console.log('\n[MIGRATION] Step 3: Migrating Historical Audit Logs...');
  const auditLogs = state.audit || [];
  for (const log of auditLogs) {
    // Audit logs in local storage are strings: "AUD-1001 - Admin credited signup bonus."
    const parts = log.split(' - ');
    const auditId = parts[0] || `AUD-${Math.random().toString(36).substr(2, 9)}`;
    const action = parts[1] || log;
    
    // Check if audit log already exists
    const allAudits = await db.auditLogs.list();
    if (allAudits.some(a => a.id === auditId)) {
      continue;
    }

    await db.auditLogs.create({
      id: auditId,
      adminUsername: action.includes('Admin') ? 'admin' : 'System',
      action: action
    });
  }
  console.log(`  - Migrated ${auditLogs.length} audit logs.`);

  console.log('\n[MIGRATION] Step 4: Migrating Transaction Ledger...');
  const ledger = state.ledger || [];
  const existingLedger = await db.transactions.listAll();
  let txCount = 0;
  for (const tx of ledger) {
    // Ledger structure in localStorage:
    // { userId: "USR102", label: "Admin signup bonus", amount: 150, type: "credit", actor: "Admin", audit: "AUD-1001" }
    
    // Prevent duplicate insert
    if (existingLedger.some(x => x.user_id === tx.userId && x.audit_id === tx.audit && x.amount === tx.amount)) {
      continue;
    }

    await db.transactions.create({
      user_id: tx.userId,
      type: tx.type,
      label: tx.label,
      amount: Math.abs(tx.amount),
      actor: tx.actor || 'Admin',
      audit_id: tx.audit
    });
    txCount++;
  }
  console.log(`  - Migrated ${txCount} transaction ledger rows.`);

  console.log('\n[MIGRATION] Step 5: Migrating Tournaments...');
  const tournaments = state.tournaments || [];
  for (const t of tournaments) {
    let dbT = await db.tournaments.findById(t.id);
    if (!dbT) {
      const entryFee = t.entryFee || t.entry || 0;
      const prizePool = t.prizePool || t.prize || 0;
      const tId = await db.tournaments.create({
        id: t.id,
        game: t.game,
        title: t.title,
        mode: t.mode,
        map: t.map,
        match_time: t.time || '',
        entry_fee: entryFee,
        prize_pool: prizePool,
        player_limit: t.playerLimit || 100,
        team_limit: t.teamLimit || 25,
        registration: t.registration || 'Admin window',
        filled_slots: t.filledSlots || 0,
        per_kill: t.rewards ? (t.rewards.perKill || 0) : 0,
        booyah: t.rewards ? (t.rewards.booyah || 0) : 0,
        rank1: t.rewards ? (t.rewards.rank1 || 0) : 0,
        rank2: t.rewards ? (t.rewards.rank2 || 0) : 0,
        rank3: t.rewards ? (t.rewards.rank3 || 0) : 0,
        rank4to10: t.rewards ? (t.rewards.rank4to10 || 0) : 0,
        mvp: t.rewards ? (t.rewards.mvp || 0) : 0,
        special_rewards: t.rewards ? (t.rewards.specialRewards || 'None') : 'None',
        status: t.status || 'registration_open',
        room_id: t.roomId || null,
        room_password: t.roomPassword || null,
        room_released: !!t.roomReleased
      });
      console.log(`  - Created Tournament: ${t.title} (${t.id})`);
    }

    // Migrate participants
    const participants = t.participants || [];
    for (const p of participants) {
      // Participant: { userId: "USR102", userName: "RogueRavi", joinedAt: "...", status: "pending", refunded: false }
      const existingP = await db.participants.find(t.id, p.userId);
      if (!existingP) {
        await db.participants.create({
          tournament_id: t.id,
          user_id: p.userId,
          status: p.status || 'pending',
          checked_in: !!p.checkedIn,
          refunded: !!p.refunded,
          winnings: Number(p.winnings || 0.00)
        });
        console.log(`    - Joined user ${p.userName || p.userId} to tournament ${t.id} (${p.status})`);
      }
    }
  }

  console.log('\n[MIGRATION] Step 6: Migrating Payment Requests (Deposits)...');
  const paymentRequests = state.paymentRequests || [];
  for (const pr of paymentRequests) {
    const existingPR = await db.paymentRequests.findById(pr.requestId);
    if (!existingPR) {
      await db.paymentRequests.create({
        request_id: pr.requestId,
        user_id: pr.userId,
        amount: Number(pr.amount),
        utr_number: pr.utrNumber,
        screenshot_filename: pr.screenshotFilename,
        screenshot_hash: pr.screenshotHash,
        status: pr.status || 'Pending Verification',
        admin_notes: pr.adminNotes || '',
        linked_request_id: pr.linkedRequestId || null,
        duplicate_flags: pr.duplicateFlags || []
      });
      console.log(`  - Migrated Payment Request ${pr.requestId} (Amount: ${pr.amount})`);
    }
  }

  console.log('\n[MIGRATION] Step 7: Migrating General Requests (Withdrawals & Rewards)...');
  const requests = state.requests || [];
  for (const r of requests) {
    // Requests in local storage:
    // { id: 1, type: "Withdrawal", userId: "USR102", user: "RogueRavi", amount: 250, status: "Pending admin review", reason: "UPI payout request" }
    if (r.type === 'Withdrawal') {
      const allW = await db.withdrawals.listAll();
      if (!allW.some(w => w.user_id === r.userId && w.amount === r.amount && w.upi_id === (r.reason || ''))) {
        await db.withdrawals.create({
          user_id: r.userId,
          amount: Number(r.amount),
          upi_id: r.reason || 'UPI Payout',
          status: r.status === 'Pending admin review' ? 'Pending Verification' : r.status,
          admin_notes: r.reason || ''
        });
        console.log(`  - Migrated Withdrawal Request for ${r.user} (Amount: ${r.amount})`);
      }
    } else if (r.type === 'Reward Approval' || r.type === 'Refund') {
      const allR = await db.query ? [] : localDb.admin_requests;
      if (db.usePostgres) {
        const res = await db.query('SELECT * FROM admin_requests WHERE user_id = $1 AND amount = $2', [r.userId, r.amount]);
        if (res.rows.length === 0) {
          await db.query(
            'INSERT INTO admin_requests (type, user_id, amount, status, reason, tournament_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [r.type, r.userId, r.amount, r.status === 'Pending admin review' ? 'Pending admin review' : r.status, r.reason || '', r.tournamentId || null]
          );
          console.log(`  - Migrated Admin Request ${r.type} for ${r.user} (Amount: ${r.amount})`);
        }
      } else {
        if (!localDb.admin_requests) localDb.admin_requests = [];
        if (!localDb.admin_requests.some(x => x.user_id === r.userId && x.amount === r.amount && x.type === r.type)) {
          localDb.admin_requests.push({
            id: localDb.admin_requests.length + 1,
            type: r.type,
            user_id: r.userId,
            amount: Number(r.amount),
            status: r.status === 'Pending admin review' ? 'Pending admin review' : r.status,
            reason: r.reason || '',
            tournament_id: r.tournamentId || null,
            created_at: new Date().toISOString()
          });
          db.saveLocalDb();
          console.log(`  - Migrated Admin Request ${r.type} for ${r.user} (Amount: ${r.amount})`);
        }
      }
    }
  }

  // Create new audit trail entry
  const auditId = await db.auditLogs.create({
    adminUsername: 'admin',
    action: `Completed import migration utility from browser data file: ${filePath}.`
  });
  console.log(`\n[MIGRATION SUCCESS] Migration finished successfully! Logged under audit ID: ${auditId}`);
}

const fileArg = process.argv[2];
migrate(fileArg)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration failed with error:', err);
    process.exit(1);
  });
