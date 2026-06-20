/**
 * tickets.service.js — Support Tickets Service Layer
 */

'use strict';

const uuid = require('uuid');
const db = require('../../config/db');
const storage = require('../../config/storage');
const env = require('../../config/env');

/**
 * Creates a new support ticket.
 * Optionally uploads a screenshot file to Supabase.
 */
async function createTicket(userId, { title, description, category, file }) {
  let screenshotUrl = null;

  if (file) {
    const fileId = uuid.v4();
    const fileExt = file.originalname.split('.').pop() || 'jpg';
    const storagePath = `tickets/${userId}/${fileId}.${fileExt}`;

    screenshotUrl = await storage.uploadFile(
      env.SUPABASE_STORAGE_BUCKET,
      storagePath,
      file.buffer,
      file.mimetype
    );
  }

  const result = await db.query(
    `INSERT INTO support_tickets (user_id, title, description, category, screenshot_url, status)
     VALUES ($1, $2, $3, $4, $5, 'open')
     RETURNING *`,
    [userId, title, description, category, screenshotUrl]
  );

  return result.rows[0];
}

/**
 * Retrieves a paginated list of tickets for a specific user.
 */
async function getMyTickets(userId, page = 1, limit = 10) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;

  const result = await db.query(
    `SELECT id, title, category, status, created_at, updated_at
     FROM support_tickets
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limitNum, offset]
  );

  const countRes = await db.query(
    'SELECT COUNT(*) FROM support_tickets WHERE user_id = $1',
    [userId]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  return {
    tickets: result.rows,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
}

/**
 * Retrieves a single ticket with all its chat replies.
 * Verifies that the requester owns the ticket.
 */
async function getTicket(ticketId, userId) {
  const ticketRes = await db.query(
    `SELECT id, user_id, title, description, category, screenshot_url, status, created_at, updated_at
     FROM support_tickets
     WHERE id = $1`,
    [ticketId]
  );

  if (ticketRes.rowCount === 0) {
    throw new Error('Support ticket not found.');
  }

  const ticket = ticketRes.rows[0];
  if (ticket.user_id !== userId) {
    throw new Error('Access denied. You do not have permission to view this ticket.');
  }

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
  return ticket;
}

/**
 * Adds a new reply message to an open support ticket.
 */
async function addReply(ticketId, userId, message) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Fetch ticket and verify owner
    const ticketRes = await client.query(
      'SELECT user_id, status FROM support_tickets WHERE id = $1 FOR UPDATE',
      [ticketId]
    );

    if (ticketRes.rowCount === 0) {
      throw new Error('Support ticket not found.');
    }

    const ticket = ticketRes.rows[0];
    if (ticket.user_id !== userId) {
      throw new Error('Access denied. You do not have permission to reply to this ticket.');
    }

    if (ticket.status === 'closed') {
      throw new Error('This support ticket is closed. Further replies are blocked.');
    }

    // 2. Insert reply message
    const replyRes = await client.query(
      `INSERT INTO ticket_replies (ticket_id, sender_type, sender_id, message)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [ticketId, userId, message]
    );

    // 3. Re-open ticket if it was resolved
    await client.query(
      `UPDATE support_tickets
       SET status = 'open', updated_at = NOW()
       WHERE id = $1`,
      [ticketId]
    );

    await client.query('COMMIT');
    return replyRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createTicket,
  getMyTickets,
  getTicket,
  addReply,
};
