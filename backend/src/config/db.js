/**
 * db.js — PostgreSQL connection pool configuration.
 * Uses node-postgres (pg) to manage connections.
 */

'use strict';

const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes('sslmode=require') || env.IS_PRODUCTION
    ? { rejectUnauthorized: false }
    : false,
});

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
