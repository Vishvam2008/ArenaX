/**
 * inApp.js — In-App Notification Channel Handler
 * Writes notification records directly to the PostgreSQL database.
 */

'use strict';

const db = require('../../config/db');

/**
 * Sends/stores an in-app notification in the database.
 * @param {object} params
 * @param {string|null} params.userId - UUID of user, or null for broadcast
 * @param {string} params.title - Title of notification
 * @param {string} params.body - Detailed text content
 * @param {string} params.type - Category (e.g. 'tournament', 'payment', 'withdrawal', 'reward', 'system')
 * @param {string} [params.referenceId=null] - UUID of associated record
 * @param {string} [params.referenceType=null] - Type of associated record
 * @returns {Promise<object>} Created notification record
 */
async function send({ userId, title, body, type, referenceId = null, referenceType = null }) {
  const sql = `
    INSERT INTO notifications (user_id, title, body, type, reference_id, reference_type, is_read, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
    RETURNING *
  `;
  const res = await db.query(sql, [
    userId,
    title,
    body,
    type,
    referenceId,
    referenceType,
  ]);
  return res.rows[0];
}

module.exports = {
  send,
};
