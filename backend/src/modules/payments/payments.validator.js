/**
 * payments.validator.js — Payments Validation Rules
 */

'use strict';

const { body } = require('express-validator');

const submitPaymentRules = [
  body('amount')
    .trim()
    .isFloat({ min: 1 }).withMessage('Deposit amount must be a positive number greater than or equal to 1.'),

  body('utrNumber')
    .trim()
    .isLength({ min: 12, max: 20 }).withMessage('UTR number must be between 12 and 20 characters long.')
    .matches(/^[A-Za-z0-9]+$/).withMessage('UTR number must be alphanumeric (letters and numbers only).'),
];

module.exports = {
  submitPaymentRules,
};
