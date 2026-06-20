/**
 * rateLimiter.js — API Rate Limiting Middleware
 * Protects endpoints from DDoS and brute-force attacks.
 */

'use strict';

const rateLimit = require('express-rate-limit');
const response = require('../utils/response');

/** Custom handler to format rate-limit blocks in standard JSON error style */
const limitReachedHandler = (message, statusCode = 429) => {
  return (req, res) => {
    return response.error(res, message, statusCode);
  };
};

/** Limits sensitive authentication actions (login, register, reset-pw) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Max 15 attempts per IP per window
  handler: limitReachedHandler('Too many authentication attempts. Please try again after 15 minutes.'),
  standardHeaders: true,
  legacyHeaders: false,
});

/** General API rate limiter applied to standard queries */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // Max 120 requests per minute
  handler: limitReachedHandler('Too many requests. Rate limit exceeded.'),
  standardHeaders: true,
  legacyHeaders: false,
});

/** Limits resource-heavy file uploads (avatars, screenshots) */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 uploads per minute
  handler: limitReachedHandler('Too many file upload requests. Please wait a minute.'),
  standardHeaders: true,
  legacyHeaders: false,
});

/** Limits administrative dashboard operations */
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Max 60 admin requests per minute
  handler: limitReachedHandler('Rate limit exceeded for administrator API.'),
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  apiLimiter,
  uploadLimiter,
  adminLimiter,
};
