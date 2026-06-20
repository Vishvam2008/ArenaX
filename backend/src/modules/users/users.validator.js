/**
 * users.validator.js — Users Validation Rules
 */

'use strict';

const { body } = require('express-validator');

const updateProfileRules = [
  body('phone')
    .optional()
    .trim()
    .matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid 10-digit Indian mobile number.'),

  body('ff_uid')
    .optional()
    .trim()
    .notEmpty().withMessage('Free Fire UID cannot be empty if provided.'),

  body('ff_username')
    .optional()
    .trim()
    .notEmpty().withMessage('Free Fire username cannot be empty if provided.'),
];

module.exports = {
  updateProfileRules,
};
