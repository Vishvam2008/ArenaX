/**
 * withdrawals.validator.js — Withdrawals Validation Rules
 */

'use strict';

const { body } = require('express-validator');

const requestWithdrawalRules = [
  body('amount')
    .trim()
    .isFloat({ min: 1 }).withMessage('Withdrawal amount must be a positive number greater than or equal to 1.'),

  body()
    .custom((value, { req }) => {
      const upiId = req.body.upiId || req.body.upi_id;
      if (!upiId || !/^[a-zA-Z0-9.\-_]+@[a-zA-Z]+$/.test(String(upiId).trim())) {
        throw new Error('Please provide a valid UPI ID (e.g. name@bank).');
      }
      req.body.upiId = String(upiId).trim();
      return true;
    }),
];

module.exports = {
  requestWithdrawalRules,
};
