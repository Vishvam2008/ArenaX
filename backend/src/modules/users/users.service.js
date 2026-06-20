/**
 * users.service.js — Users Service Layer
 */

'use strict';

const db = require('../../config/db');
const storage = require('../../config/storage');
const env = require('../../config/env');

/**
 * Retrieves the full user profile including wallet balance.
 */
async function getProfile(userId) {
  const result = await db.query(
    `SELECT u.id, u.username, u.email, u.phone, u.ff_uid, u.ff_username, u.avatar_url, u.created_at,
            w.balance AS wallet_balance
     FROM users u
     JOIN wallets w ON w.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new Error('User not found.');
  }

  const profile = result.rows[0];
  const stats = await getStats(userId);
  profile.stats = stats;

  return profile;
}

/**
 * Updates basic profile details.
 */
async function updateProfile(userId, { phone, ff_uid, ff_username }) {
  // Update fields if provided
  const result = await db.query(
    `UPDATE users
     SET phone = COALESCE($1, phone),
         ff_uid = COALESCE($2, ff_uid),
         ff_username = COALESCE($3, ff_username),
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, username, email, phone, ff_uid, ff_username, avatar_url, updated_at`,
    [phone, ff_uid, ff_username, userId]
  );

  if (result.rowCount === 0) {
    throw new Error('User not found.');
  }

  return result.rows[0];
}

/**
 * Uploads avatar image to Supabase Storage and updates the user record.
 */
async function updateAvatar(userId, file) {
  if (!file) {
    throw new Error('No avatar file provided.');
  }

  // Generate unique filename
  const fileExt = file.originalname.split('.').pop() || 'jpg';
  const path = `avatars/${userId}/${Date.now()}.${fileExt}`;

  // Upload to Supabase Storage
  const publicUrl = await storage.uploadFile(
    env.SUPABASE_STORAGE_BUCKET,
    path,
    file.buffer,
    file.mimetype
  );

  // Update DB
  const result = await db.query(
    `UPDATE users
     SET avatar_url = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, username, avatar_url`,
    [publicUrl, userId]
  );

  return result.rows[0];
}

/**
 * Calculates user gaming and earnings statistics.
 */
async function getStats(userId) {
  const result = await db.query(
    `SELECT
       COUNT(DISTINCT p.tournament_id) AS matches_played,
       COUNT(DISTINCT CASE WHEN r.status = 'approved' AND r.rank = 1 THEN r.id END) AS wins,
       COUNT(DISTINCT CASE WHEN r.status = 'approved' AND r.got_booyah = true THEN r.id END) AS booyahs,
       COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.kills ELSE 0 END), 0)::INTEGER AS total_kills,
       COALESCE(SUM(CASE WHEN rw.transaction_id IS NOT NULL THEN rw.amount ELSE 0 END), 0)::DECIMAL(10,2) AS total_earnings
     FROM users u
     LEFT JOIN participants p ON p.user_id = u.id
     LEFT JOIN results r ON r.user_id = u.id AND r.tournament_id = p.tournament_id
     LEFT JOIN rewards rw ON rw.user_id = u.id AND rw.tournament_id = p.tournament_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );

  if (result.rowCount === 0) {
    return {
      matches_played: 0,
      wins: 0,
      booyahs: 0,
      total_kills: 0,
      total_earnings: "0.00",
    };
  }

  return result.rows[0];
}

module.exports = {
  getProfile,
  updateProfile,
  updateAvatar,
  getStats,
};
