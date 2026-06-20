/**
 * auth.js — Authentication Middleware
 * Validates JWT access tokens from the Authorization header (Bearer <token>).
 */

'use strict';

const jwt = require('../utils/jwt');
const response = require('../utils/response');

/**
 * Authenticates requests from standard users.
 */
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.error(res, 'Access denied. No token provided.', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verifyAccessToken(token);
    // Standard user payloads should have at least id and role
    req.user = decoded;
    next();
  } catch (err) {
    return response.error(res, 'Invalid or expired access token.', 401, err.message);
  }
}

/**
 * Authenticates requests from administrators or super administrators.
 */
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.error(res, 'Access denied. No admin token provided.', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verifyAccessToken(token);
    if (decoded.role !== 'admin' && decoded.role !== 'super_admin') {
      return response.error(res, 'Access denied. Administrator privileges required.', 403);
    }
    req.admin = decoded;
    req.user = decoded; // For routes that reuse general user components
    next();
  } catch (err) {
    return response.error(res, 'Invalid or expired admin access token.', 401, err.message);
  }
}

/**
 * Optionally authenticates requests. If a valid token is present, populates req.user.
 * Does not block the request if token is missing or invalid.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verifyAccessToken(token);
      req.user = decoded;
    } catch (err) {
      // Ignore token verification errors for optional auth
    }
  }
  next();
}

module.exports = {
  authenticateUser,
  authenticateAdmin,
  optionalAuth,
};
