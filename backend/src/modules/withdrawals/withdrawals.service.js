/**
 * withdrawals.service.js — Withdrawals Service Layer
 */

'use strict';

const db = require('../../config/db');
const walletUtil = require('../../utils/wallet');

/**
 * Creates a new withdrawal request.
 * Debits the wallet balance immediately (as a hold) and creates a pending withdrawal record.
 */
async function requestWithdrawal(userId, { upiId, amount }) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Invalid withdrawal amount.');
  }

  // 1. Load withdrawal limits from database settings
  const settingsRes = await db.query(
    `SELECT key, value FROM settings
     WHERE key IN ('min_withdrawal', 'max_withdrawal')`
  );

  let minWithdrawal = 50;
  let maxWithdrawal = 5000;

  settingsRes.rows.forEach((row) => {
    if (row.key === 'min_withdrawal') minWithdrawal = parseFloat(row.value);
    if (row.key === 'max_withdrawal') maxWithdrawal = parseFloat(row.value);
  });

  if (numericAmount < minWithdrawal || numericAmount > maxWithdrawal) {
    throw new Error(`Withdrawal amount must be between ₹${minWithdrawal} and ₹${maxWithdrawal}.`);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 2. Perform wallet debit immediately (checks frozen state, blocked withdrawals, and balance)
    const transaction = await walletUtil.debitWallet(
      userId,
      numericAmount,
      'withdrawal',
      null, // Updated below
      'withdrawal',
      `Hold for withdrawal to ${upiId}`,
      client
    );

    // 3. Save withdrawal record
    const insertRes = await client.query(
      `INSERT INTO withdrawals (user_id, amount, upi_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [userId, numericAmount, upiId]
    );

    const withdrawal = insertRes.rows[0];

    // 4. Update transaction references with the new withdrawal ID
    await client.query(
      'UPDATE transactions SET reference_id = $1 WHERE id = $2',
      [withdrawal.id, transaction.id]
    );

    await client.query('COMMIT');
    return withdrawal;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves a user's withdrawal request history.
 */
async function getWithdrawalHistory(userId, page = 1, limit = 10) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;

  const result = await db.query(
    `SELECT id, amount, upi_id, status, admin_note, reviewed_at, created_at
     FROM withdrawals
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limitNum, offset]
  );

  const countRes = await db.query(
    'SELECT COUNT(*) FROM withdrawals WHERE user_id = $1',
    [userId]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  return {
    history: result.rows,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
}

module.exports = {
  requestWithdrawal,
  getWithdrawalHistory,
};
