/**
 * db.js — PostgreSQL connection pool configuration.
 * Uses node-postgres (pg) to manage connections.
 */

'use strict';

const { Pool } = require('pg');
const env = require('./env');

// Always use the DATABASE_URL provided by the runtime (Railway/Vercel/Render/etc)
// Avoid any hardcoded hostnames or environment-specific defaults.
const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;

// Some platforms (and/or mistaken env wiring) may provide a DATABASE_URL
// that points at an unresolvable internal hostname (e.g. "base").
// We must not hardcode hosts, but we *can* detect and fail fast with a
// descriptive error to avoid misleading partial API failures.
if (typeof connectionString === 'string') {
  // Extract hostname from postgresql://user:pass@HOST:PORT/db
  const m = connectionString.match(/^[a-zA-Z]+:\/\/[^@/]+@([^:/?#]+)(?::\d+)?/);
  const host = m && m[1] ? m[1] : null;
  if (host && host.toLowerCase() === 'base') {
    throw new Error(
      'Invalid DATABASE_URL: hostname "base" is not resolvable. ' +
        'Set DATABASE_URL to the managed Postgres connection string provided by your deployment.'
    );
  }
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') || env.IS_PRODUCTION
    ? { rejectUnauthorized: false }
    : false,
});

/**
 * NOTE:
 * We intentionally avoid logging DATABASE_URL or its hostname/credentials.
 * Debugging should rely on deployment logs instead.
 */

pool.on('error', (err) => {
  console.error('❌ Unexpected database error on idle client:', err);
});

module.exports = {
  pool,
  /**
   * Execute a query against the pool.
   * @param {string} text - SQL query string
   * @param {Array} params - Parameterized query values
   * @returns {Promise<import('pg').QueryResult>}
   */
  query: (text, params) => pool.query(text, params),
  /**
   * Acquire a client from the pool for transactions.
   * @returns {Promise<import('pg').PoolClient>}
   */
  getClient: () => pool.connect(),
};
