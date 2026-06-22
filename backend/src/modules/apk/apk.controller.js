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
    // 1) Primary query: latest flag
    const latestRes = await db.query(
      `SELECT version_name, version_code, apk_url, changelog, created_at
       FROM apk_versions
       WHERE is_latest = true
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (latestRes.rowCount > 0) {
      return response.success(res, latestRes.rows[0], 'Latest APK details retrieved.');
    }

    // 2) Fallback: newest by version_code (desc) then created_at
    //    This prevents the frontend download button from disappearing when
    //    is_latest flags are missing or incorrect.
    const fallbackRes = await db.query(
      `SELECT version_name, version_code, apk_url, changelog, created_at
       FROM apk_versions
       ORDER BY version_code DESC, created_at DESC
       LIMIT 1`
    );

    // Safe, prod-safe diagnostics: no sensitive data, just counts and chosen strategy.
    if (process.env.NODE_ENV === 'production') {
      console.info('[apk/latest] latest flag not found; falling back to newest row.', {
        latestRowCount: latestRes.rowCount,
        fallbackRowCount: fallbackRes.rowCount,
      });
    }

    if (fallbackRes.rowCount === 0) {
      return response.error(res, 'No APK releases available.', 404);
    }

    return response.success(
      res,
      fallbackRes.rows[0],
      'Latest APK details retrieved (fallback selected).'
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getLatestApk,
};
