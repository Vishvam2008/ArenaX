/**
 * validate.js — Request Validation Middleware Wrapper
 * Collects input validation errors and aborts with a formatted HTTP 400 response.
 */

'use strict';

const { validationResult } = require('express-validator');
const response = require('../utils/response');

/**
 * Runs Express validation checks and reports errors.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Format error array into key-value descriptions
    const formattedErrors = errors.array().map((err) => {
      return {
        field: err.path || err.param,
        message: err.msg,
      };
    });

    return response.error(res, 'Invalid request input parameters.', 400, formattedErrors);
  }

  next();
}

module.exports = {
  validate,
};
