/**
 * wallet.service.js — Wallet Service Layer
 */

'use strict';

const db = require('../../config/db');

/**
 * Retrieves user's wallet info and their 5 most recent transactions.
 */
async function getWallet(userId) {
  // Fetch wallet
  const walletRes = await db.query(
    `SELECT id, balance, is_frozen, withdrawals_blocked, created_at, updated_at
     FROM wallets
     WHERE user_id = $1`,
    [userId]
  );

  if (walletRes.rowCount === 0) {
    throw new Error('Wallet not found for this user.');
  }

  const wallet = walletRes.rows[0];

  // Fetch 5 recent transactions
  const txRes = await db.query(
    `SELECT id, type, category, amount, balance_before, balance_after, reference_id, reference_type, note, created_at
     FROM transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [userId]
  );

  wallet.recentTransactions = txRes.rows;
  return wallet;
}

/**
 * Retrieves paginated and optionally filtered transaction history.
 */
async function getTransactions(userId, { page = 1, limit = 10, category = null }) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;

  let queryText = `
    SELECT id, type, category, amount, balance_before, balance_after, reference_id, reference_type, note, created_at
    FROM transactions
    WHERE user_id = $1
  `;
  const params = [userId];

  if (category) {
    params.push(category);
    queryText += ` AND category = $${params.length}`;
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const queryParams = [...params, limitNum, offset];

  const txRes = await db.query(queryText, queryParams);

  // Count query for pagination meta
  let countQueryText = 'SELECT COUNT(*) FROM transactions WHERE user_id = $1';
  if (category) {
    countQueryText += ' AND category = $2';
  }
  const countRes = await db.query(countQueryText, params);
  const total = parseInt(countRes.rows[0].count, 10);

  return {
    transactions: txRes.rows,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
}

module.exports = {
  getWallet,
  getTransactions,
};
