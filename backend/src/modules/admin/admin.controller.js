/**
 * admin.controller.js — Consolidated Admin HTTP Handlers
 * Restricts all actions to authenticated administrator roles.
 */

'use strict';

const bcrypt = require('bcrypt');
const uuid = require('uuid');
const db = require('../../config/db');
const jwt = require('../../utils/jwt');
const response = require('../../utils/response');
const { logAudit } = require('../../utils/auditLogger');
const walletUtil = require('../../utils/wallet');
const storage = require('../../config/storage');
const env = require('../../config/env');
const { createNotification } = require('../../utils/notification');

const COOKIE_NAME = 'adminRefreshToken';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// ==========================================
// 1. Admin Authentication
// ==========================================

async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await db.query(
      'SELECT id, username, email, password_hash, role, is_active FROM admins WHERE email = $1',
      [email]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'Invalid email or password.', 401);
    }

    const admin = result.rows[0];
    if (!admin.is_active) {
      return response.error(res, 'This administrator account is inactive.', 403);
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return response.error(res, 'Invalid email or password.', 401);
    }

    await db.query('UPDATE admins SET last_login = NOW() WHERE id = $1', [admin.id]);

    const payload = { id: admin.id, username: admin.username, role: admin.role };
    const accessToken = jwt.generateAccessToken(payload);
    const refreshToken = jwt.generateRefreshToken({ id: admin.id });

    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);

    await logAudit({
      actorType: 'admin',
      actorId: admin.id,
      action: 'login',
      entityType: 'admin',
      entityId: admin.id,
      req,
    });

    return response.success(res, {
      admin: { id: admin.id, username: admin.username, email: admin.email, role: admin.role },
      accessToken,
    }, 'Admin login successful.');
  } catch (err) {
    next(err);
  }
}

async function adminLogout(req, res, next) {
  try {
    const adminId = req.admin?.id;
    if (adminId) {
      await logAudit({
        actorType: 'admin',
        actorId: adminId,
        action: 'logout',
        entityType: 'admin',
        entityId: adminId,
        req,
      });
    }
    res.clearCookie(COOKIE_NAME);
    return response.success(res, null, 'Admin logged out.');
  } catch (err) {
    next(err);
  }
}

async function getAdminProfile(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, username, email, role, last_login, created_at FROM admins WHERE id = $1',
      [req.admin.id]
    );
    if (result.rowCount === 0) {
      return response.error(res, 'Admin profile not found.', 404);
    }
    return response.success(res, result.rows[0], 'Admin profile retrieved.');
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 2. User Management
// ==========================================

async function listUsers(req, res, next) {
  try {
    const { search, is_banned, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    let sql = `SELECT id, username, email, phone, ff_uid, ff_username, avatar_url, is_active, is_banned, created_at, last_login FROM users WHERE 1=1`;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (username ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length} OR ff_uid ILIKE $${params.length})`;
    }
    if (is_banned !== undefined) {
      params.push(is_banned === 'true');
      sql += ` AND is_banned = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const queryParams = [...params, limitNum, offset];

    const result = await db.query(sql, queryParams);

    let countSql = 'SELECT COUNT(*) FROM users WHERE 1=1';
    for (let i = 1; i <= params.length; i++) {
      const field = i === 1 && search ? 'search' : 'is_banned';
      if (field === 'search') {
        countSql += ` AND (username ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 OR ff_uid ILIKE $1)`;
      } else {
        countSql += ` AND is_banned = $${i}`;
      }
    }
    const countRes = await db.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    return response.success(res, {
      users: result.rows,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    }, 'Users retrieved.');
  } catch (err) {
    next(err);
  }
}

async function getUserDetail(req, res, next) {
  try {
    const userId = req.params.id;

    // Fetch user info
    const userRes = await db.query(
      `SELECT id, username, email, phone, ff_uid, ff_username, avatar_url, is_active, is_banned, created_at, last_login
       FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rowCount === 0) {
      return response.error(res, 'User not found.', 404);
    }
    const user = userRes.rows[0];

    // Fetch wallet info
    const walletRes = await db.query(
      'SELECT id, balance, is_frozen, withdrawals_blocked FROM wallets WHERE user_id = $1',
      [userId]
    );
    user.wallet = walletRes.rows[0] || null;

    // Fetch last 10 transactions
    const txRes = await db.query(
      `SELECT id, type, category, amount, balance_before, balance_after, reference_id, reference_type, note, created_at
       FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );
    user.recentTransactions = txRes.rows;

    return response.success(res, user, 'User details retrieved.');
  } catch (err) {
    next(err);
  }
}

async function banUser(req, res, next) {
  try {
    const userId = req.params.id;
    const { reason = 'Violation of rules.' } = req.body;

    const result = await db.query(
      'UPDATE users SET is_banned = true, updated_at = NOW() WHERE id = $1 RETURNING id, username',
      [userId]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'User not found.', 404);
    }

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'ban_user',
      entityType: 'user',
      entityId: userId,
      payload: { reason },
      req,
    });

    await createNotification({
      userId,
      title: 'Account Banned',
      body: `Your account has been banned by an administrator. Reason: ${reason}`,
      type: 'system',
    });

    return response.success(res, result.rows[0], 'User account banned successfully.');
  } catch (err) {
    next(err);
  }
}

async function unbanUser(req, res, next) {
  try {
    const userId = req.params.id;

    const result = await db.query(
      'UPDATE users SET is_banned = false, updated_at = NOW() WHERE id = $1 RETURNING id, username',
      [userId]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'User not found.', 404);
    }

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'unban_user',
      entityType: 'user',
      entityId: userId,
      req,
    });

    await createNotification({
      userId,
      title: 'Account Unbanned',
      body: 'Your account has been unbanned by an administrator. You can now participate in matches.',
      type: 'system',
    });

    return response.success(res, result.rows[0], 'User account unbanned successfully.');
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 3. Wallet / Ledger Controls
// ==========================================

async function adminCreditWallet(req, res, next) {
  try {
    const userId = req.params.id;
    const { amount, note } = req.body;

    const tx = await walletUtil.creditWallet(
      userId,
      amount,
      'admin_credit',
      null,
      'manual',
      note || 'Manual credit by admin.'
    );

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin_credit_wallet',
      entityType: 'user',
      entityId: userId,
      payload: { amount, note, transactionId: tx.id },
      req,
    });

    await createNotification({
      userId,
      title: 'Wallet Credited',
      body: `Your wallet has been credited with ₹${amount}. Reason: ${note || 'Admin Adjustment'}`,
      type: 'payment',
      referenceId: tx.id,
      referenceType: 'transaction',
    });

    return response.success(res, tx, 'Wallet credited successfully.');
  } catch (err) {
    next(err);
  }
}

async function adminDebitWallet(req, res, next) {
  try {
    const userId = req.params.id;
    const { amount, note } = req.body;

    const tx = await walletUtil.debitWallet(
      userId,
      amount,
      'admin_debit',
      null,
      'manual',
      note || 'Manual debit by admin.'
    );

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin_debit_wallet',
      entityType: 'user',
      entityId: userId,
      payload: { amount, note, transactionId: tx.id },
      req,
    });

    await createNotification({
      userId,
      title: 'Wallet Debited',
      body: `Your wallet has been debited with ₹${amount}. Reason: ${note || 'Admin Adjustment'}`,
      type: 'payment',
      referenceId: tx.id,
      referenceType: 'transaction',
    });

    return response.success(res, tx, 'Wallet debited successfully.');
  } catch (err) {
    next(err);
  }
}

async function freezeWallet(req, res, next) {
  try {
    const userId = req.params.id;
    const result = await db.query(
      'UPDATE wallets SET is_frozen = true, updated_at = NOW() WHERE user_id = $1 RETURNING id, is_frozen',
      [userId]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'Wallet not found.', 404);
    }

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'freeze_wallet',
      entityType: 'wallet',
      entityId: result.rows[0].id,
      req,
    });

    await createNotification({
      userId,
      title: 'Wallet Frozen',
      body: 'Your wallet has been frozen due to security audits. Outgoing transfers are blocked.',
      type: 'system',
    });

    return response.success(res, result.rows[0], 'Wallet frozen.');
  } catch (err) {
    next(err);
  }
}

async function unfreezeWallet(req, res, next) {
  try {
    const userId = req.params.id;
    const result = await db.query(
      'UPDATE wallets SET is_frozen = false, updated_at = NOW() WHERE user_id = $1 RETURNING id, is_frozen',
      [userId]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'Wallet not found.', 404);
    }

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'unfreeze_wallet',
      entityType: 'wallet',
      entityId: result.rows[0].id,
      req,
    });

    await createNotification({
      userId,
      title: 'Wallet Unfrozen',
      body: 'Your wallet has been unfrozen. Normal operations are restored.',
      type: 'system',
    });

    return response.success(res, result.rows[0], 'Wallet unfrozen.');
  } catch (err) {
    next(err);
  }
}

async function blockWithdrawals(req, res, next) {
  try {
    const userId = req.params.id;
    const { block } = req.body; // boolean

    const result = await db.query(
      'UPDATE wallets SET withdrawals_blocked = $1, updated_at = NOW() WHERE user_id = $2 RETURNING id, withdrawals_blocked',
      [block === true || block === 'true', userId]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'Wallet not found.', 404);
    }

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: block ? 'block_withdrawals' : 'unblock_withdrawals',
      entityType: 'wallet',
      entityId: result.rows[0].id,
      req,
    });

    await createNotification({
      userId,
      title: block ? 'Withdrawals Blocked' : 'Withdrawals Unblocked',
      body: block
        ? 'Withdrawals have been temporarily blocked for your wallet.'
        : 'Withdrawals have been unblocked for your wallet.',
      type: 'system',
    });

    return response.success(res, result.rows[0], block ? 'Withdrawals blocked.' : 'Withdrawals unblocked.');
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 4. Manual Payment Verification
// ==========================================

async function listPayments(req, res, next) {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    let sql = `
      SELECT p.id, p.amount, p.utr_number, p.screenshot_url, p.status, p.created_at, p.admin_note, p.reviewed_at,
             u.username, u.email, u.phone
      FROM payment_requests p
      JOIN users u ON u.id = p.user_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND p.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (p.utr_number ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
    }

    sql += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const queryParams = [...params, limitNum, offset];

    const result = await db.query(sql, queryParams);

    let countSql = `
      SELECT COUNT(*) FROM payment_requests p
      JOIN users u ON u.id = p.user_id
      WHERE 1=1
    `;
    for (let i = 1; i <= params.length; i++) {
      const field = i === 1 && status ? 'status' : 'search';
      if (field === 'status') {
        countSql += ` AND p.status = $1`;
      } else {
        countSql += ` AND (p.utr_number ILIKE $${i} OR u.username ILIKE $${i})`;
      }
    }
    const countRes = await db.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    return response.success(res, {
      payments: result.rows,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    }, 'Payments retrieved.');
  } catch (err) {
    next(err);
  }
}

async function approvePayment(req, res, next) {
  const client = await db.getClient();
  try {
    const paymentId = req.params.id;
    const { adminNote } = req.body;

    await client.query('BEGIN');

    // Lock payment request row
    const payRes = await client.query(
      'SELECT id, user_id, amount, status FROM payment_requests WHERE id = $1 FOR UPDATE',
      [paymentId]
    );

    if (payRes.rowCount === 0) {
      throw new Error('Payment request not found.');
    }

    const payment = payRes.rows[0];
    if (payment.status !== 'pending') {
      throw new Error(`Cannot approve a payment request that is already ${payment.status}.`);
    }

    // Update payment request status
    await client.query(
      `UPDATE payment_requests
       SET status = 'approved', admin_note = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [adminNote || 'Approved.', req.admin.id, paymentId]
    );

    // Credit user's wallet
    const transaction = await walletUtil.creditWallet(
      payment.user_id,
      payment.amount,
      'deposit',
      paymentId,
      'payment',
      `Manual deposit approved. UTR check.`,
      client
    );

    await client.query('COMMIT');

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'approve_payment',
      entityType: 'payment_request',
      entityId: paymentId,
      payload: { amount: payment.amount, userId: payment.user_id, transactionId: transaction.id },
      req,
    });

    await createNotification({
      userId: payment.user_id,
      title: 'Deposit Approved!',
      body: `Your deposit request of ₹${payment.amount} has been approved. Balance updated.`,
      type: 'payment',
      referenceId: paymentId,
      referenceType: 'payment',
    });

    return response.success(res, null, 'Payment request approved successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function rejectPayment(req, res, next) {
  try {
    const paymentId = req.params.id;
    const { adminNote = 'Invalid transaction details.' } = req.body;

    const payRes = await db.query(
      'SELECT user_id, amount, status FROM payment_requests WHERE id = $1',
      [paymentId]
    );

    if (payRes.rowCount === 0) {
      return response.error(res, 'Payment request not found.', 404);
    }

    const payment = payRes.rows[0];
    if (payment.status !== 'pending') {
      return response.error(res, `Cannot reject a request that is already ${payment.status}.`, 400);
    }

    await db.query(
      `UPDATE payment_requests
       SET status = 'rejected', admin_note = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [adminNote, req.admin.id, paymentId]
    );

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'reject_payment',
      entityType: 'payment_request',
      entityId: paymentId,
      payload: { amount: payment.amount, reason: adminNote },
      req,
    });

    await createNotification({
      userId: payment.user_id,
      title: 'Deposit Rejected',
      body: `Your deposit request of ₹${payment.amount} was rejected. Reason: ${adminNote}`,
      type: 'payment',
      referenceId: paymentId,
      referenceType: 'payment',
    });

    return response.success(res, null, 'Payment request rejected.');
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 5. Withdrawal Requests
// ==========================================

async function listWithdrawals(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    let sql = `
      SELECT w.id, w.amount, w.upi_id, w.status, w.created_at, w.admin_note, w.reviewed_at,
             u.username, u.email, u.phone
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND w.status = $${params.length}`;
    }

    sql += ` ORDER BY w.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const queryParams = [...params, limitNum, offset];

    const result = await db.query(sql, queryParams);

    let countSql = `
      SELECT COUNT(*) FROM withdrawals w
      WHERE 1=1
    `;
    if (status) {
      countSql += ` AND w.status = $1`;
    }
    const countRes = await db.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    return response.success(res, {
      withdrawals: result.rows,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    }, 'Withdrawals list retrieved.');
  } catch (err) {
    next(err);
  }
}

async function approveWithdrawal(req, res, next) {
  try {
    const withdrawalId = req.params.id;
    const { adminNote } = req.body;

    const wdRes = await db.query(
      'SELECT user_id, amount, status FROM withdrawals WHERE id = $1',
      [withdrawalId]
    );

    if (wdRes.rowCount === 0) {
      return response.error(res, 'Withdrawal request not found.', 404);
    }

    const withdrawal = wdRes.rows[0];
    if (withdrawal.status !== 'pending') {
      return response.error(res, `Cannot approve a request that is already ${withdrawal.status}.`, 400);
    }

    // Since wallet was already debited (held) at request time, we just update status to approved
    await db.query(
      `UPDATE withdrawals
       SET status = 'approved', admin_note = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [adminNote || 'Processed.', req.admin.id, withdrawalId]
    );

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'approve_withdrawal',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      payload: { amount: withdrawal.amount, userId: withdrawal.user_id },
      req,
    });

    await createNotification({
      userId: withdrawal.user_id,
      title: 'Withdrawal Approved!',
      body: `Your withdrawal of ₹${withdrawal.amount} has been approved and sent to your UPI address.`,
      type: 'withdrawal',
      referenceId: withdrawalId,
      referenceType: 'withdrawal',
    });

    return response.success(res, null, 'Withdrawal request approved.');
  } catch (err) {
    next(err);
  }
}

async function rejectWithdrawal(req, res, next) {
  const client = await db.getClient();
  try {
    const withdrawalId = req.params.id;
    const { adminNote = 'Invalid UPI details.' } = req.body;

    await client.query('BEGIN');

    // Lock withdrawal request row
    const wdRes = await client.query(
      'SELECT id, user_id, amount, status FROM withdrawals WHERE id = $1 FOR UPDATE',
      [withdrawalId]
    );

    if (wdRes.rowCount === 0) {
      throw new Error('Withdrawal request not found.');
    }

    const withdrawal = wdRes.rows[0];
    if (withdrawal.status !== 'pending') {
      throw new Error(`Cannot reject a request that is already ${withdrawal.status}.`);
    }

    // 1. Update status
    await client.query(
      `UPDATE withdrawals
       SET status = 'rejected', admin_note = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [adminNote, req.admin.id, withdrawalId]
    );

    // 2. Refund balance back to user's wallet
    const transaction = await walletUtil.creditWallet(
      withdrawal.user_id,
      withdrawal.amount,
      'refund',
      withdrawalId,
      'withdrawal',
      `Refund: Withdrawal request rejected. Reason: ${adminNote}`,
      client
    );

    await client.query('COMMIT');

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'reject_withdrawal',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      payload: { amount: withdrawal.amount, reason: adminNote, refundTransactionId: transaction.id },
      req,
    });

    await createNotification({
      userId: withdrawal.user_id,
      title: 'Withdrawal Rejected',
      body: `Your withdrawal request of ₹${withdrawal.amount} was rejected. Funds refunded to wallet. Reason: ${adminNote}`,
      type: 'withdrawal',
      referenceId: withdrawalId,
      referenceType: 'withdrawal',
    });

    return response.success(res, null, 'Withdrawal request rejected and refunded.');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ==========================================
// 6. Tournament Admin Operations
// ==========================================

async function createTournament(req, res, next) {
  try {
    const {
      title,
      game,
      matchType,
      entryFee,
      prizePool,
      perKillReward,
      booyahReward,
      totalSlots,
      matchTime,
      registrationEndTime,
      rulesText,
    } = req.body;

    let bannerUrl = null;
    if (req.file) {
      const bannerId = uuid.v4();
      const fileExt = req.file.originalname.split('.').pop() || 'jpg';
      const storagePath = `banners/${bannerId}.${fileExt}`;
      bannerUrl = await storage.uploadFile(
        env.SUPABASE_STORAGE_BUCKET,
        storagePath,
        req.file.buffer,
        req.file.mimetype
      );
    }

    const checkinOpenTime = new Date(new Date(matchTime).getTime() - 60 * 60 * 1000); // 1 hour prior
    const roomReleaseTime = new Date(new Date(matchTime).getTime() - 15 * 60 * 1000); // 15 mins prior

    const result = await db.query(
      `INSERT INTO tournaments (
         title, game, match_type, banner_url, entry_fee, prize_pool, per_kill_reward, booyah_reward,
         total_slots, match_time, registration_end_time, checkin_open_time, room_release_time, status, rules_text, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'upcoming', $14, $15)
       RETURNING *`,
      [
        title,
        game || 'free_fire',
        matchType,
        bannerUrl,
        parseFloat(entryFee) || 0.0,
        parseFloat(prizePool) || 0.0,
        parseFloat(perKillReward) || 0.0,
        parseFloat(booyahReward) || 0.0,
        parseInt(totalSlots, 10),
        matchTime,
        registrationEndTime,
        checkinOpenTime,
        roomReleaseTime,
        rulesText,
        req.admin.id,
      ]
    );

    const tournament = result.rows[0];

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'create_tournament',
      entityType: 'tournament',
      entityId: tournament.id,
      payload: tournament,
      req,
    });

    return response.success(res, tournament, 'Tournament created successfully.', 201);
  } catch (err) {
    next(err);
  }
}

async function updateTournament(req, res, next) {
  try {
    const tournamentId = req.params.id;
    const {
      title,
      game,
      matchType,
      entryFee,
      prizePool,
      perKillReward,
      booyahReward,
      totalSlots,
      matchTime,
      registrationEndTime,
      rulesText,
      status,
    } = req.body;

    let bannerUrl = null;
    if (req.file) {
      const bannerId = uuid.v4();
      const fileExt = req.file.originalname.split('.').pop() || 'jpg';
      const storagePath = `banners/${bannerId}.${fileExt}`;
      bannerUrl = await storage.uploadFile(
        env.SUPABASE_STORAGE_BUCKET,
        storagePath,
        req.file.buffer,
        req.file.mimetype
      );
    }

    const tRes = await db.query('SELECT status, banner_url FROM tournaments WHERE id = $1', [tournamentId]);
    if (tRes.rowCount === 0) {
      return response.error(res, 'Tournament not found.', 404);
    }

    const currentBannerUrl = bannerUrl || tRes.rows[0].banner_url;

    const result = await db.query(
      `UPDATE tournaments
       SET title = COALESCE($1, title),
           game = COALESCE($2, game),
           match_type = COALESCE($3, match_type),
           banner_url = $4,
           entry_fee = COALESCE($5, entry_fee),
           prize_pool = COALESCE($6, prize_pool),
           per_kill_reward = COALESCE($7, per_kill_reward),
           booyah_reward = COALESCE($8, booyah_reward),
           total_slots = COALESCE($9, total_slots),
           match_time = COALESCE($10, match_time),
           registration_end_time = COALESCE($11, registration_end_time),
           rules_text = COALESCE($12, rules_text),
           status = COALESCE($13, status),
           updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        title,
        game,
        matchType,
        currentBannerUrl,
        entryFee ? parseFloat(entryFee) : null,
        prizePool ? parseFloat(prizePool) : null,
        perKillReward ? parseFloat(perKillReward) : null,
        booyahReward ? parseFloat(booyahReward) : null,
        totalSlots ? parseInt(totalSlots, 10) : null,
        matchTime,
        registrationEndTime,
        rulesText,
        status,
        tournamentId,
      ]
    );

    const updated = result.rows[0];

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'update_tournament',
      entityType: 'tournament',
      entityId: tournamentId,
      payload: updated,
      req,
    });

    return response.success(res, updated, 'Tournament updated.');
  } catch (err) {
    next(err);
  }
}

async function deleteTournament(req, res, next) {
  try {
    const tournamentId = req.params.id;

    // Check status
    const tRes = await db.query('SELECT status, filled_slots FROM tournaments WHERE id = $1', [tournamentId]);
    if (tRes.rowCount === 0) {
      return response.error(res, 'Tournament not found.', 404);
    }

    const { status, filled_slots } = tRes.rows[0];
    if (status !== 'upcoming' && status !== 'cancelled') {
      return response.error(res, 'Cannot delete an active or completed tournament. Cancel it first.', 400);
    }
    if (filled_slots > 0) {
      return response.error(res, 'Cannot delete tournament with registered participants. Remove participants first.', 400);
    }

    await db.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'delete_tournament',
      entityType: 'tournament',
      entityId: tournamentId,
      req,
    });

    return response.success(res, null, 'Tournament deleted successfully.');
  } catch (err) {
    next(err);
  }
}

async function updateTournamentStatus(req, res, next) {
  try {
    const tournamentId = req.params.id;
    const { status } = req.body;

    const result = await db.query(
      'UPDATE tournaments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status, title',
      [status, tournamentId]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'Tournament not found.', 404);
    }

    const tournament = result.rows[0];

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'update_tournament_status',
      entityType: 'tournament',
      entityId: tournamentId,
      payload: { status },
      req,
    });

    return response.success(res, tournament, 'Tournament status updated.');
  } catch (err) {
    next(err);
  }
}

async function setRoomDetails(req, res, next) {
  try {
    const tournamentId = req.params.id;
    const { roomId, roomPassword } = req.body;

    // 1. Insert/Update Room Details
    await db.query(
      `INSERT INTO room_details (tournament_id, room_id, room_password, released_at, created_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (tournament_id)
       DO UPDATE SET room_id = EXCLUDED.room_id, room_password = EXCLUDED.room_password, released_at = NOW(), created_by = EXCLUDED.created_by`,
      [tournamentId, roomId, roomPassword, req.admin.id]
    );

    // 2. Update tournament status to room_released
    await db.query(
      "UPDATE tournaments SET status = 'room_released', updated_at = NOW() WHERE id = $1",
      [tournamentId]
    );

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'set_room_details',
      entityType: 'tournament',
      entityId: tournamentId,
      payload: { roomId },
      req,
    });

    // 3. Notify all checked-in participants
    const parts = await db.query(
      'SELECT user_id FROM participants WHERE tournament_id = $1 AND has_checked_in = true',
      [tournamentId]
    );

    for (const p of parts.rows) {
      await createNotification({
        userId: p.user_id,
        title: 'Room Details Released!',
        body: `Lobby Room ID: ${roomId} and Password have been published. Join the game lobby immediately.`,
        type: 'tournament',
        referenceId: tournamentId,
        referenceType: 'tournament',
      });
    }

    return response.success(res, null, 'Room details released and participants notified.');
  } catch (err) {
    next(err);
  }
}

async function downloadParticipantsCsv(req, res, next) {
  try {
    const tournamentId = req.params.id;

    const parts = await db.query(
      `SELECT p.slot_number, p.has_checked_in, p.is_eliminated, u.username, u.email, u.phone, u.ff_username, u.ff_uid,
              t.name AS team_name
       FROM participants p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.tournament_id = $1
       ORDER BY p.slot_number ASC`,
      [tournamentId]
    );

    // Format as CSV
    let csv = 'Slot,Username,FF_Name,FF_UID,Phone,Team,CheckedIn,Eliminated\n';
    parts.rows.forEach((r) => {
      csv += `${r.slot_number},"${r.username}","${r.ff_username}","${r.ff_uid}","${r.phone}","${r.team_name || ''}",${r.has_checked_in},${r.is_eliminated}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=participants_tournament_${tournamentId}.csv`);
    return res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}

async function removeParticipant(req, res, next) {
  const client = await db.getClient();
  try {
    const { id: tournamentId, userId } = req.params;

    await client.query('BEGIN');

    // 1. Fetch participant and lock
    const pRes = await client.query(
      'SELECT id, payment_deducted, slot_number FROM participants WHERE tournament_id = $1 AND user_id = $2 FOR UPDATE',
      [tournamentId, userId]
    );

    if (pRes.rowCount === 0) {
      throw new Error('Participant registration not found.');
    }

    const participant = pRes.rows[0];

    // 2. Fetch tournament info
    const tRes = await client.query('SELECT title, entry_fee FROM tournaments WHERE id = $1', [tournamentId]);
    const tournament = tRes.rows[0];

    // 3. Refund if payment was deducted
    if (participant.payment_deducted && parseFloat(tournament.entry_fee) > 0) {
      await walletUtil.creditWallet(
        userId,
        tournament.entry_fee,
        'refund',
        tournamentId,
        'tournament',
        `Refund: Unregistered from tournament: ${tournament.title}`,
        client
      );
    }

    // 4. Delete registration
    await client.query('DELETE FROM participants WHERE id = $1', [participant.id]);

    // 5. Decrement filled slots
    await client.query(
      'UPDATE tournaments SET filled_slots = GREATEST(0, filled_slots - 1), updated_at = NOW() WHERE id = $1',
      [tournamentId]
    );

    await client.query('COMMIT');

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'remove_participant',
      entityType: 'tournament',
      entityId: tournamentId,
      payload: { userId },
      req,
    });

    await createNotification({
      userId,
      title: 'Removed from Match',
      body: `You have been removed from the tournament: ${tournament.title}. Entry fee refunded if paid.`,
      type: 'tournament',
    });

    return response.success(res, null, 'Participant removed and refunded.');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ==========================================
// 7. Results & Reward Distribution
// ==========================================

async function listResults(req, res, next) {
  try {
    const { status, tournamentId, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    let sql = `
      SELECT r.id, r.tournament_id, r.user_id, r.rank, r.kills, r.got_booyah, r.is_mvp,
             r.match_screenshot_url, r.kill_screenshot_url, r.result_screenshot_url,
             r.status, r.admin_note, r.submitted_at,
             u.username, u.ff_username, u.ff_uid,
             t.title AS tournament_title
      FROM results r
      JOIN users u ON u.id = r.user_id
      JOIN tournaments t ON t.id = r.tournament_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND r.status = $${params.length}`;
    }
    if (tournamentId) {
      params.push(tournamentId);
      sql += ` AND r.tournament_id = $${params.length}`;
    }

    sql += ` ORDER BY r.submitted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const queryParams = [...params, limitNum, offset];

    const result = await db.query(sql, queryParams);

    let countSql = 'SELECT COUNT(*) FROM results r WHERE 1=1';
    for (let i = 1; i <= params.length; i++) {
      const field = i === 1 && status ? 'status' : 'tournamentId';
      if (field === 'status') {
        countSql += ' AND r.status = $1';
      } else {
        countSql += ` AND r.tournament_id = $${i}`;
      }
    }
    const countRes = await db.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    return response.success(res, {
      results: result.rows,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    }, 'Results retrieved.');
  } catch (err) {
    next(err);
  }
}

async function approveResult(req, res, next) {
  const client = await db.getClient();
  try {
    const resultId = req.params.id;

    await client.query('BEGIN');

    // 1. Lock result row
    const resCheck = await client.query(
      'SELECT * FROM results WHERE id = $1 FOR UPDATE',
      [resultId]
    );
    if (resCheck.rowCount === 0) {
      throw new Error('Result record not found.');
    }
    const result = resCheck.rows[0];

    if (result.status !== 'pending') {
      throw new Error(`Cannot approve a result that is already ${result.status}.`);
    }

    // 2. Fetch tournament rewards config
    const tRes = await client.query(
      'SELECT title, prize_pool, per_kill_reward, booyah_reward FROM tournaments WHERE id = $1',
      [result.tournament_id]
    );
    const tournament = tRes.rows[0];

    // 3. Mark result approved
    await client.query(
      `UPDATE results
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.admin.id, resultId]
    );

    // 4. Calculate payouts
    // Default Rank Payouts (Rank 1: 50%, Rank 2: 30%, Rank 3: 20%)
    let rankPayout = 0;
    const rank = parseInt(result.rank, 10);
    const prizePool = parseFloat(tournament.prize_pool);

    if (rank === 1) rankPayout = prizePool * 0.50;
    else if (rank === 2) rankPayout = prizePool * 0.30;
    else if (rank === 3) rankPayout = prizePool * 0.20;

    const killPayout = parseInt(result.kills, 10) * parseFloat(tournament.per_kill_reward);
    const booyahPayout = result.got_booyah ? parseFloat(tournament.booyah_reward) : 0;
    const mvpPayout = result.is_mvp ? 50.00 : 0.00; // Fixed flat ₹50 reward for match MVP

    const payouts = [
      { type: 'rank', amt: rankPayout, note: `Rank ${rank} Reward` },
      { type: 'kill', amt: killPayout, note: `${result.kills} Kills Reward` },
      { type: 'booyah', amt: booyahPayout, note: 'Booyah Winner Reward' },
      { type: 'mvp', amt: mvpPayout, note: 'Match MVP Reward' },
    ];

    let totalDisbursed = 0;

    // Credit each payout category
    for (const p of payouts) {
      if (p.amt > 0) {
        // Credit wallet
        const tx = await walletUtil.creditWallet(
          result.user_id,
          p.amt,
          'reward',
          result.tournament_id,
          'tournament',
          `${p.note} for ${tournament.title}`,
          client
        );

        // Record reward detail
        await client.query(
          `INSERT INTO rewards (tournament_id, user_id, result_id, reward_type, amount, transaction_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [result.tournament_id, result.user_id, resultId, p.type, p.amt, tx.id]
        );

        totalDisbursed += p.amt;
      }
    }

    await client.query('COMMIT');

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'approve_match_result',
      entityType: 'result',
      entityId: resultId,
      payload: { userId: result.user_id, rank: result.rank, totalDisbursed },
      req,
    });

    await createNotification({
      userId: result.user_id,
      title: 'Match Rewards Credited!',
      body: `Your results for ${tournament.title} have been verified. Total rewards of ₹${totalDisbursed} credited to your wallet!`,
      type: 'reward',
      referenceId: resultId,
      referenceType: 'result',
    });

    return response.success(res, null, `Result approved. Total rewards of ₹${totalDisbursed} credited.`);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function rejectResult(req, res, next) {
  try {
    const resultId = req.params.id;
    const { adminNote = 'Screenshots did not match reported statistics.' } = req.body;

    const resCheck = await db.query('SELECT tournament_id, user_id, status FROM results WHERE id = $1', [resultId]);
    if (resCheck.rowCount === 0) {
      return response.error(res, 'Result record not found.', 404);
    }
    const result = resCheck.rows[0];

    if (result.status !== 'pending') {
      return response.error(res, `Cannot reject a result that is already ${result.status}.`, 400);
    }

    await db.query(
      `UPDATE results
       SET status = 'rejected', admin_note = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [adminNote, req.admin.id, resultId]
    );

    // Fetch tournament title
    const tRes = await db.query('SELECT title FROM tournaments WHERE id = $1', [result.tournament_id]);
    const title = tRes.rows[0].title;

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'reject_match_result',
      entityType: 'result',
      entityId: resultId,
      payload: { reason: adminNote, userId: result.user_id },
      req,
    });

    await createNotification({
      userId: result.user_id,
      title: 'Match Results Rejected',
      body: `Your results for ${title} were rejected. Reason: ${adminNote}`,
      type: 'reward',
      referenceId: resultId,
      referenceType: 'result',
    });

    return response.success(res, null, 'Match results rejected.');
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 8. Notifications Broadcasts
// ==========================================

async function sendBroadcast(req, res, next) {
  try {
    const { title, body, type = 'system' } = req.body;

    await createNotification({
      userId: null, // null registers as broadcast
      title,
      body,
      type,
    });

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'broadcast_notification',
      payload: { title, type },
      req,
    });

    return response.success(res, null, 'Broadcast notification dispatched.');
  } catch (err) {
    next(err);
  }
}

async function sendToUser(req, res, next) {
  try {
    const { userId, title, body, type = 'system', referenceId, referenceType } = req.body;

    await createNotification({
      userId,
      title,
      body,
      type,
      referenceId,
      referenceType,
    });

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'send_user_notification',
      entityType: 'user',
      entityId: userId,
      payload: { title, type },
      req,
    });

    return response.success(res, null, 'User notification sent.');
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 9. PWA / APK releases
// ==========================================

async function listApkVersions(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, version_name, version_code, apk_url, changelog, is_latest, created_at FROM apk_versions ORDER BY version_code DESC'
    );
    return response.success(res, result.rows, 'APK versions list retrieved.');
  } catch (err) {
    next(err);
  }
}

async function uploadApk(req, res, next) {
  const client = await db.getClient();
  try {
    const { versionName, versionCode, changelog } = req.body;

    if (!req.file) {
      return response.error(res, 'APK binary file is required.', 400);
    }

    await client.query('BEGIN');

    // 1. Upload APK to Supabase
    const apkId = uuid.v4();
    const storagePath = `releases/${apkId}.apk`;
    const apkUrl = await storage.uploadFile(
      env.SUPABASE_STORAGE_BUCKET,
      storagePath,
      req.file.buffer,
      req.file.mimetype
    );

    // 2. De-activate all current latest flags
    await client.query('UPDATE apk_versions SET is_latest = false');

    // 3. Insert new version
    const insertRes = await client.query(
      `INSERT INTO apk_versions (version_name, version_code, apk_url, changelog, is_latest, uploaded_by)
       VALUES ($1, $2, $3, $4, true, $5)
       RETURNING *`,
      [versionName, parseInt(versionCode, 10), apkUrl, changelog, req.admin.id]
    );

    const version = insertRes.rows[0];

    await client.query('COMMIT');

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'upload_apk',
      entityType: 'apk_version',
      entityId: version.id,
      payload: version,
      req,
    });

    // Notify all active users of a new app update
    await createNotification({
      userId: null,
      title: 'App Update Available!',
      body: `Version ${versionName} is out. Check changelog and download immediately for patch fixes.`,
      type: 'system',
    });

    return response.success(res, version, 'APK version uploaded successfully.', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function deleteApkVersion(req, res, next) {
  try {
    const apkId = req.params.id;

    // Check version
    const versionRes = await db.query('SELECT apk_url FROM apk_versions WHERE id = $1', [apkId]);
    if (versionRes.rowCount === 0) {
      return response.error(res, 'APK version not found.', 404);
    }

    const { apk_url } = versionRes.rows[0];
    const path = apk_url.substring(apk_url.indexOf('releases/'));

    // 1. Delete from Supabase Storage
    try {
      await storage.deleteFile(env.SUPABASE_STORAGE_BUCKET, path);
    } catch (err) {
      console.warn('Failed to delete file from Supabase storage, proceeding with DB removal...', err.message);
    }

    // 2. Delete from DB
    await db.query('DELETE FROM apk_versions WHERE id = $1', [apkId]);

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'delete_apk',
      entityType: 'apk_version',
      entityId: apkId,
      req,
    });

    return response.success(res, null, 'APK version deleted.');
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 10. Audit Logs
// ==========================================

async function listAuditLogs(req, res, next) {
  try {
    const { actor_type, action, entity_type, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const offset = (pageNum - 1) * limitNum;

    let sql = 'SELECT id, actor_type, actor_id, action, entity_type, entity_id, payload, ip_address, user_agent, created_at FROM audit_logs WHERE 1=1';
    const params = [];

    if (actor_type) {
      params.push(actor_type);
      sql += ` AND actor_type = $${params.length}`;
    }
    if (action) {
      params.push(action);
      sql += ` AND action = $${params.length}`;
    }
    if (entity_type) {
      params.push(entity_type);
      sql += ` AND entity_type = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const queryParams = [...params, limitNum, offset];

    const result = await db.query(sql, queryParams);

    let countSql = 'SELECT COUNT(*) FROM audit_logs WHERE 1=1';
    for (let i = 1; i <= params.length; i++) {
      const field = i === 1 && actor_type ? 'actor_type' : (i === 2 && action ? 'action' : 'entity_type');
      countSql += ` AND ${field} = $${i}`;
    }
    const countRes = await db.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    return response.success(res, {
      logs: result.rows,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    }, 'Audit logs retrieved.');
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 11. Settings & Merchant UPI
// ==========================================

async function getAllSettings(req, res, next) {
  try {
    const result = await db.query('SELECT key, value, description, updated_at FROM settings');
    return response.success(res, result.rows, 'All settings retrieved.');
  } catch (err) {
    next(err);
  }
}

async function updateSetting(req, res, next) {
  try {
    const key = req.params.key;
    const { value } = req.body;

    const result = await db.query(
      `UPDATE settings
       SET value = $1, updated_by = $2, updated_at = NOW()
       WHERE key = $3
       RETURNING key, value, description, updated_at`,
      [value, req.admin.id, key]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'Setting key not found.', 404);
    }

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'update_setting',
      payload: { key, value },
      req,
    });

    return response.success(res, result.rows[0], 'Setting updated successfully.');
  } catch (err) {
    next(err);
  }
}

async function uploadQRCode(req, res, next) {
  try {
    if (!req.file) {
      return response.error(res, 'UPI QR code image is required.', 400);
    }

    // Upload image to Supabase
    const imageId = uuid.v4();
    const fileExt = req.file.originalname.split('.').pop() || 'jpg';
    const storagePath = `settings/qr_code_${imageId}.${fileExt}`;

    const qrImageUrl = await storage.uploadFile(
      env.SUPABASE_STORAGE_BUCKET,
      storagePath,
      req.file.buffer,
      req.file.mimetype
    );

    // Update settings table
    const result = await db.query(
      `UPDATE settings
       SET value = $1, updated_by = $2, updated_at = NOW()
       WHERE key = 'qr_image_url'
       RETURNING key, value, updated_at`,
      [qrImageUrl, req.admin.id]
    );

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'update_upi_qr_code',
      payload: { qrImageUrl },
      req,
    });

    return response.success(res, result.rows[0], 'UPI QR code image uploaded.');
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 12. Support Tickets (Admin Views)
// ==========================================

async function listTickets(req, res, next) {
  try {
    const { status, category, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    let sql = `
      SELECT t.id, t.title, t.category, t.status, t.created_at, t.updated_at,
             u.username, u.email
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }
    if (category) {
      params.push(category);
      sql += ` AND t.category = $${params.length}`;
    }

    sql += ` ORDER BY t.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const queryParams = [...params, limitNum, offset];

    const result = await db.query(sql, queryParams);

    let countSql = 'SELECT COUNT(*) FROM support_tickets t WHERE 1=1';
    for (let i = 1; i <= params.length; i++) {
      const field = i === 1 && status ? 'status' : 'category';
      countSql += ` AND t.${field} = $${i}`;
    }
    const countRes = await db.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    return response.success(res, {
      tickets: result.rows,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    }, 'Support tickets list retrieved.');
  } catch (err) {
    next(err);
  }
}

async function getTicketDetail(req, res, next) {
  try {
    const ticketId = req.params.id;

    // Fetch ticket details
    const ticketRes = await db.query(
      `SELECT t.id, t.title, t.description, t.category, t.screenshot_url, t.status, t.created_at, t.updated_at,
              u.id AS user_id, u.username, u.email, u.phone, u.ff_username, u.ff_uid
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [ticketId]
    );

    if (ticketRes.rowCount === 0) {
      return response.error(res, 'Support ticket not found.', 404);
    }

    const ticket = ticketRes.rows[0];

    // Fetch replies
    const repliesRes = await db.query(
      `SELECT r.id, r.sender_type, r.sender_id, r.message, r.created_at,
              CASE WHEN r.sender_type = 'user' THEN u.username ELSE a.username END AS sender_username
       FROM ticket_replies r
       LEFT JOIN users u ON u.id = r.sender_id AND r.sender_type = 'user'
       LEFT JOIN admins a ON a.id = r.sender_id AND r.sender_type = 'admin'
       WHERE r.ticket_id = $1
       ORDER BY r.created_at ASC`,
      [ticketId]
    );

    ticket.replies = repliesRes.rows;
    return response.success(res, ticket, 'Ticket details retrieved.');
  } catch (err) {
    next(err);
  }
}

async function addAdminReply(req, res, next) {
  const client = await db.getClient();
  try {
    const ticketId = req.params.id;
    const { message } = req.body;

    await client.query('BEGIN');

    // 1. Verify ticket exists and lock
    const ticketRes = await client.query(
      'SELECT user_id, status FROM support_tickets WHERE id = $1 FOR UPDATE',
      [ticketId]
    );

    if (ticketRes.rowCount === 0) {
      throw new Error('Support ticket not found.');
    }

    const ticket = ticketRes.rows[0];
    if (ticket.status === 'closed') {
      throw new Error('This ticket is closed. You cannot add further replies.');
    }

    // 2. Insert admin reply
    const replyRes = await client.query(
      `INSERT INTO ticket_replies (ticket_id, sender_type, sender_id, message)
       VALUES ($1, 'admin', $2, $3)
       RETURNING *`,
      [ticketId, req.admin.id, message]
    );

    // 3. Update ticket status to in_progress
    await client.query(
      `UPDATE support_tickets
       SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1`,
      [ticketId]
    );

    await client.query('COMMIT');

    await createNotification({
      userId: ticket.user_id,
      title: 'Ticket Reply Received',
      body: 'An administrator has replied to your support ticket. View details in app.',
      type: 'ticket',
      referenceId: ticketId,
      referenceType: 'ticket',
    });

    return response.success(res, replyRes.rows[0], 'Reply posted successfully.', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function updateTicketStatus(req, res, next) {
  try {
    const ticketId = req.params.id;
    const { status } = req.body; // resolved, closed

    const result = await db.query(
      `UPDATE support_tickets
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, user_id`,
      [status, ticketId]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'Support ticket not found.', 404);
    }

    const ticket = result.rows[0];

    await logAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'update_ticket_status',
      entityType: 'support_ticket',
      entityId: ticketId,
      payload: { status },
      req,
    });

    await createNotification({
      userId: ticket.user_id,
      title: `Ticket ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      body: `Your support ticket has been marked as ${status} by our administration team.`,
      type: 'ticket',
      referenceId: ticketId,
      referenceType: 'ticket',
    });

    return response.success(res, ticket, 'Ticket status updated.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminLogin,
  adminLogout,
  getAdminProfile,

  listUsers,
  getUserDetail,
  banUser,
  unbanUser,

  adminCreditWallet,
  adminDebitWallet,
  freezeWallet,
  unfreezeWallet,
  blockWithdrawals,

  listPayments,
  approvePayment,
  rejectPayment,

  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,

  createTournament,
  updateTournament,
  deleteTournament,
  updateTournamentStatus,
  setRoomDetails,
  downloadParticipantsCsv,
  removeParticipant,

  listResults,
  approveResult,
  rejectResult,

  sendBroadcast,
  sendToUser,

  listApkVersions,
  uploadApk,
  deleteApkVersion,

  listAuditLogs,

  getAllSettings,
  updateSetting,
  uploadQRCode,

  listTickets,
  getTicketDetail,
  addAdminReply,
  updateTicketStatus,
};
