/**
 * hash.js — Hashing and Cryptographic Helpers
 * Uses bcrypt for passwords and crypto for files/tokens.
 */

'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const env = require('../config/env');

/**
 * Hashes a password.
 * @param {string} password - Plain text password
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(password) {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

/**
 * Compares a plain text password with a bcrypt hash.
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} Match results
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generates a SHA256 hash of a file buffer.
 * Used for verifying duplicate file uploads (e.g. payment screenshots).
 * @param {Buffer} buffer - File buffer
 * @returns {string} SHA-256 hex digest
 */
function generateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generates a cryptographically secure random token in hex format.
 * @param {number} [bytes=32] - Number of random bytes
 * @returns {string} Hex token string
 */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
  hashPassword,
  comparePassword,
  generateFileHash,
  generateToken,
};
