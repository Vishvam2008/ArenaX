/**
 * tournaments.validator.js — Tournaments Validation Rules
 */

'use strict';

const { body } = require('express-validator');

const submitResultRules = [
  body('rank')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Rank must be a positive integer.'),

  body('kills')
    .optional()
    .isInt({ min: 0 }).withMessage('Kills must be a non-negative integer.'),

  body('gotBooyah')
    .optional()
    .isIn(['true', 'false', true, false]).withMessage('gotBooyah must be a boolean value.'),
];

module.exports = {
  submitResultRules,
};
