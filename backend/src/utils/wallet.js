/**
 * wallet.js — Wallet Transaction Helpers
 * Manages atomic ledger credits and debits. Supports passed-in transaction clients
 * for embedding wallet operations inside larger database transactions.
 */

'use strict';

const db = require('../config/db');

/**
 * Credits money to a user's wallet.
 * @param {string} userId - UUID of the user
 * @param {number|string} amount - Amount to credit (must be > 0)
 * @param {string} category - transaction category (e.g. 'deposit', 'reward', 'refund', 'admin_credit')
 * @param {string} [referenceId=null] - Associated entity UUID
 * @param {string} [referenceType=null] - Associated entity type (e.g. 'payment', 'tournament')
 * @param {string} [note=null] - Audit note
 * @param {import('pg').PoolClient} [client=null] - Optional transaction client
 * @returns {Promise<object>} Created transaction record
 */
async function creditWallet(userId, amount, category, referenceId = null, referenceType = null, note = null, client = null) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Invalid transaction amount. Must be greater than zero.');
  }

  const useTransaction = !client;
  const dbClient = client || await db.getClient();

  try {
    if (useTransaction) {
      await dbClient.query('BEGIN');
    }

    // 1. Lock wallet row for update
    const walletRes = await dbClient.query(
      'SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    if (walletRes.rowCount === 0) {
      throw new Error(`Wallet not found for user: ${userId}`);
    }

    const wallet = walletRes.rows[0];
    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore + numericAmount;

    // 2. Update wallet balance
    await dbClient.query(
      'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
      [balanceAfter, wallet.id]
    );

    // 3. Insert transaction log
    const transRes = await dbClient.query(
      `INSERT INTO transactions (wallet_id, user_id, type, category, amount, balance_before, balance_after, reference_id, reference_type, note)
       VALUES ($1, $2, 'credit', $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [wallet.id, userId, category, numericAmount, balanceBefore, balanceAfter, referenceId, referenceType, note]
    );

    if (useTransaction) {
      await dbClient.query('COMMIT');
    }

    return transRes.rows[0];
  } catch (err) {
    if (useTransaction) {
      await dbClient.query('ROLLBACK');
    }
    throw err;
  } finally {
    if (useTransaction) {
      dbClient.release();
    }
  }
}

/**
 * Debits money from a user's wallet.
 * @param {string} userId - UUID of the user
 * @param {number|string} amount - Amount to debit (must be > 0)
 * @param {string} category - transaction category (e.g. 'withdrawal', 'entry_fee', 'admin_debit')
 * @param {string} [referenceId=null] - Associated entity UUID
 * @param {string} [referenceType=null] - Associated entity type
 * @param {string} [note=null] - Audit note
 * @param {import('pg').PoolClient} [client=null] - Optional transaction client
 * @returns {Promise<object>} Created transaction record
 */
async function debitWallet(userId, amount, category, referenceId = null, referenceType = null, note = null, client = null) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Invalid transaction amount. Must be greater than zero.');
  }

  const useTransaction = !client;
  const dbClient = client || await db.getClient();

  try {
    if (useTransaction) {
      await dbClient.query('BEGIN');
    }

    // 1. Lock wallet row for update
    const walletRes = await dbClient.query(
      'SELECT id, balance, is_frozen, withdrawals_blocked FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    if (walletRes.rowCount === 0) {
      throw new Error(`Wallet not found for user: ${userId}`);
    }

    const wallet = walletRes.rows[0];

    if (wallet.is_frozen) {
      throw new Error('Wallet is frozen. Debits are blocked.');
    }

    if (category === 'withdrawal' && wallet.withdrawals_blocked) {
      throw new Error('Withdrawals are blocked for this wallet.');
    }

    const balanceBefore = parseFloat(wallet.balance);
    if (balanceBefore < numericAmount) {
      throw new Error('Insufficient wallet balance.');
    }

    const balanceAfter = balanceBefore - numericAmount;

    // 2. Update wallet balance
    await dbClient.query(
      'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
      [balanceAfter, wallet.id]
    );

    // 3. Insert transaction log
    const transRes = await dbClient.query(
      `INSERT INTO transactions (wallet_id, user_id, type, category, amount, balance_before, balance_after, reference_id, reference_type, note)
       VALUES ($1, $2, 'debit', $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [wallet.id, userId, category, numericAmount, balanceBefore, balanceAfter, referenceId, referenceType, note]
    );

    if (useTransaction) {
      await dbClient.query('COMMIT');
    }

    return transRes.rows[0];
  } catch (err) {
    if (useTransaction) {
      await dbClient.query('ROLLBACK');
    }
    throw err;
  } finally {
    if (useTransaction) {
      dbClient.release();
    }
  }
}

module.exports = {
  creditWallet,
  debitWallet,
};
