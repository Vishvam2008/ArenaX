/**
 * rbac.js — Role-Based Access Control Middleware
 * Restricts admin routes based on role hierarchies.
 */

'use strict';

const response = require('../utils/response');

/**
 * Enforces that the authenticated admin has one of the specified roles.
 * @param {...string} roles - Allowed roles (e.g. 'admin', 'super_admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return response.error(res, 'Access denied. Insufficient privileges.', 403);
    }
    next();
  };
}

/**
 * Enforces that the authenticated admin is a super_admin.
 */
function requireSuperAdmin(req, res, next) {
  if (!req.admin || req.admin.role !== 'super_admin') {
    return response.error(res, 'Access denied. Super Administrator role required.', 403);
  }
  next();
}

module.exports = {
  requireRole,
  requireSuperAdmin,
};
