/**
 * notifications.controller.js — Notifications HTTP Handlers
 */

'use strict';

const db = require('../../config/db');
const response = require('../../utils/response');

/**
 * Retrieves a paginated list of notifications for the authenticated user,
 * including system-wide broadcasts.
 */
async function getNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT id, title, body, type, reference_id, reference_type, is_read, created_at
      FROM notifications
      WHERE user_id = $1 OR user_id IS NULL
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(sql, [userId, limit, offset]);

    const countRes = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 OR user_id IS NULL',
      [userId]
    );
    const total = parseInt(countRes.rows[0].count, 10);

    return response.success(res, {
      notifications: result.rows,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    }, 'Notifications retrieved.');
  } catch (err) {
    next(err);
  }
}

/**
 * Marks a single notification as read (only if it is owned by the user).
 */
async function markRead(req, res, next) {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await db.query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`,
      [notificationId, userId]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'Notification not found or access denied.', 404);
    }

    return response.success(res, result.rows[0], 'Notification marked as read.');
  } catch (err) {
    next(err);
  }
}

/**
 * Marks all unread user-specific notifications as read.
 */
async function markAllRead(req, res, next) {
  try {
    const userId = req.user.id;

    await db.query(
      `UPDATE notifications
       SET is_read = true
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );

    return response.success(res, null, 'All notifications marked as read.');
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the count of unread user-specific notifications.
 */
async function getUnreadCount(req, res, next) {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );

    return response.success(res, result.rows[0], 'Unread count retrieved.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
};
