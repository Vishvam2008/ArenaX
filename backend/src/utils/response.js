/**
 * response.js — Standard API Response Helpers
 * Ensures uniform response payloads across all routes.
 */

'use strict';

/**
 * Sends a success response.
 * @param {import('express').Response} res - Express Response object
 * @param {any} data - Payload data (optional)
 * @param {string} message - User-friendly success message (optional)
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function success(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Sends an error response.
 * @param {import('express').Response} res - Express Response object
 * @param {string} message - User-friendly error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {any} error - Technical error details or array of validation errors (optional)
 */
function error(res, message = 'Internal Server Error', statusCode = 500, error = null) {
  const payload = {
    success: false,
    message,
  };

  if (error) {
    payload.error = typeof error === 'string' ? error : error.message || error;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  success,
  error,
};
