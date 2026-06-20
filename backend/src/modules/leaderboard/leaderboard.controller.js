/**
 * leaderboard.controller.js — Leaderboard HTTP Handlers
 */

'use strict';

const db = require('../../config/db');
const response = require('../../utils/response');

/**
 * Retrieves the global leaderboard statistics.
 */
async function getLeaderboard(req, res, next) {
  try {
    const sortBy = req.query.sort_by || 'earnings';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const allowedSortFields = {
      kills: 'total_kills',
      wins: 'wins',
      earnings: 'total_earnings',
      matches: 'matches_played',
    };

    const sortColumn = allowedSortFields[sortBy] || 'total_earnings';

    const sql = `
      SELECT user_id, username, avatar_url, ff_uid, ff_username, matches_played, wins, booyahs, total_kills, total_earnings
      FROM leaderboard_stats
      ORDER BY ${sortColumn} DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await db.query(sql, [limit, offset]);

    const countRes = await db.query('SELECT COUNT(*) FROM leaderboard_stats');
    const total = parseInt(countRes.rows[0].count, 10);

    return response.success(res, {
      leaderboard: result.rows,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    }, 'Leaderboard retrieved successfully.');
  } catch (err) {
    next(err);
  }
}

/**
 * Refreshes the leaderboard_stats materialized view.
 * Utilizes CONCURRENT refresh to prevent blocking reads, falling back if the view has never been populated.
 */
async function refreshLeaderboard(req, res, next) {
  try {
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_stats');
    return response.success(res, null, 'Leaderboard refreshed concurrently.');
  } catch (err) {
    // If concurrent refresh fails (e.g. view was never populated before), run full refresh
    try {
      await db.query('REFRESH MATERIALIZED VIEW leaderboard_stats');
      return response.success(res, null, 'Leaderboard refreshed successfully.');
    } catch (fallbackErr) {
      next(fallbackErr);
    }
  }
}

module.exports = {
  getLeaderboard,
  refreshLeaderboard,
};
