/**
 * apk.controller.js — APK Version HTTP Handlers
 */

'use strict';

const db = require('../../config/db');
const response = require('../../utils/response');

/**
 * Retrieves the latest uploaded APK release.
 */
async function getLatestApk(req, res, next) {
  try {
    const result = await db.query(
      `SELECT version_name, version_code, apk_url, changelog, created_at
       FROM apk_versions
       WHERE is_latest = true
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (result.rowCount === 0) {
      return response.error(res, 'No APK releases available.', 404);
    }

    return response.success(res, result.rows[0], 'Latest APK details retrieved.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getLatestApk,
};
