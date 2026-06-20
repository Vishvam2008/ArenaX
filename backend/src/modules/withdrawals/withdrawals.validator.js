/**
 * withdrawals.validator.js — Withdrawals Validation Rules
 */

'use strict';

const { body } = require('express-validator');

const requestWithdrawalRules = [
  body('amount')
    .trim()
    .isFloat({ min: 1 }).withMessage('Withdrawal amount must be a positive number greater than or equal to 1.'),

  body('upiId')
    .trim()
    .notEmpty().withMessage('UPI ID is required.')
    .matches(/^[a-zA-Z0-9.\-_]+@[a-zA-Z]+$/).withMessage('Please provide a valid UPI ID (e.g. name@bank).'),
];

module.exports = {
  requestWithdrawalRules,
};
