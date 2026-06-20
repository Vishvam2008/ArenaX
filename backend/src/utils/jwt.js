/**
 * jwt.js — JWT Token Helpers
 * Handles signing and verifying access/refresh tokens.
 */

'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Generates a short-lived access token.
 * @param {object} payload - Token payload (e.g. { id, role })
 * @returns {string} Signed JWT
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });
}

/**
 * Generates a long-lived refresh token.
 * @param {object} payload - Token payload (e.g. { id })
 * @returns {string} Signed JWT
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES,
  });
}

/**
 * Verifies an access token.
 * @param {string} token - Signed JWT string
 * @returns {object} Decoded payload
 * @throws {Error} if token is invalid or expired
 */
function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

/**
 * Verifies a refresh token.
 * @param {string} token - Signed JWT string
 * @returns {object} Decoded payload
 * @throws {Error} if token is invalid or expired
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
