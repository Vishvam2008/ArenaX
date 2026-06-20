/**
 * errorHandler.js — Global Express Error Handling Middleware
 * Gracefully intercepts all synchronous and asynchronous request errors.
 */

'use strict';

const response = require('../utils/response');

function errorHandler(err, req, res, next) {
  // Always log the error details locally for debugging
  console.error('❌ Global error handler intercepted:', err);

  if (res.headersSent) {
    return next(err);
  }

  // 1. Handle Multer file upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return response.error(res, 'File is too large. Maximum size allowed is 5MB.', 400);
    }
    return response.error(res, `File upload failed: ${err.message}`, 400);
  }

  // 2. Handle JWT Auth errors
  if (err.name === 'JsonWebTokenError') {
    return response.error(res, 'Authentication failed. Invalid token.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return response.error(res, 'Authentication failed. Token has expired.', 401);
  }

  // 3. Handle specific PostgreSQL database errors
  if (err.code) {
    // Unique violation (23505)
    if (err.code === '23505') {
      const detail = err.detail || '';
      let message = 'A record with this unique identifier already exists.';

      if (detail.includes('email')) {
        message = 'This email address is already registered.';
      } else if (detail.includes('username')) {
        message = 'This username is already taken.';
      } else if (detail.includes('phone')) {
        message = 'This phone number is already registered.';
      } else if (detail.includes('ff_uid')) {
        message = 'This Free Fire UID is already registered.';
      } else if (detail.includes('utr_number')) {
        message = 'This UTR number has already been submitted.';
      } else if (detail.includes('tournament_id') && detail.includes('slot_number')) {
        message = 'This slot number is already occupied.';
      }

      return response.error(res, message, 409, detail);
    }

    // Foreign key constraint violation (23503)
    if (err.code === '23503') {
      return response.error(res, 'Operation failed. One or more referenced records do not exist.', 400, err.detail);
    }
  }

  // 4. Default fallback error response
  const statusCode = err.statusCode || 500;
  const clientMessage = statusCode === 500 ? 'An unexpected server error occurred.' : err.message;

  return response.error(
    res,
    clientMessage,
    statusCode,
    process.env.NODE_ENV === 'development' ? { stack: err.stack, original: err.message } : null
  );
}

module.exports = errorHandler;
