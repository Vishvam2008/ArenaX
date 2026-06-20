/**
 * auth.service.js — Authentication Service Layer
 */

'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../../config/db');
const jwt = require('../../utils/jwt');
const env = require('../../config/env');

/**
 * Registers a new user and creates their default wallet within a transaction.
 */
async function registerUser({ username, email, password, phone, ff_uid, ff_username }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    const userRes = await client.query(
      `INSERT INTO users (username, email, password_hash, phone, ff_uid, ff_username)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, phone, ff_uid, ff_username, created_at`,
      [username, email, passwordHash, phone, ff_uid, ff_username]
    );

    const user = userRes.rows[0];

    // Create wallet with 0.00 INR balance
    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0.00)`,
      [user.id]
    );

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Validates credentials and generates a session.
 */
async function loginUser(email, password) {
  const res = await db.query(
    'SELECT id, username, email, password_hash, is_active, is_banned FROM users WHERE email = $1',
    [email]
  );

  if (res.rowCount === 0) {
    throw new Error('Invalid email or password.');
  }

  const user = res.rows[0];

  if (!user.is_active) {
    throw new Error('This account has been deactivated.');
  }
  if (user.is_banned) {
    throw new Error('This account has been banned.');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Invalid email or password.');
  }

  // Update last login timestamp
  await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const payload = { id: user.id, username: user.username, role: 'user' };
  const accessToken = jwt.generateAccessToken(payload);
  const refreshToken = jwt.generateRefreshToken({ id: user.id });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: 'user',
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Generates a forgot password reset token.
 */
async function forgotPassword(email) {
  const res = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (res.rowCount === 0) {
    throw new Error('No account found with this email.');
  }

  const user = res.rows[0];
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000); // Token valid for 1 hour

  await db.query(
    `UPDATE users
     SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW()
     WHERE id = $3`,
    [token, expires, user.id]
  );

  return token;
}

/**
 * Resets the password using a valid reset token.
 */
async function resetPassword(token, newPassword) {
  const res = await db.query(
    'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()',
    [token]
  );

  if (res.rowCount === 0) {
    throw new Error('Password reset token is invalid or has expired.');
  }

  const user = res.rows[0];
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

  await db.query(
    `UPDATE users
     SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, updated_at = NOW()
     WHERE id = $2`,
    [passwordHash, user.id]
  );
}

/**
 * Verifies a refresh token and generates a new access token.
 */
async function refreshAccessToken(refreshToken) {
  const decoded = jwt.verifyRefreshToken(refreshToken);

  const res = await db.query(
    'SELECT id, username, is_active, is_banned FROM users WHERE id = $1',
    [decoded.id]
  );

  if (res.rowCount === 0) {
    throw new Error('User no longer exists.');
  }

  const user = res.rows[0];

  if (!user.is_active || user.is_banned) {
    throw new Error('Access denied. Account is inactive or banned.');
  }

  const payload = { id: user.id, username: user.username, role: 'user' };
  return jwt.generateAccessToken(payload);
}

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
};
