/**
 * payments.validator.js — Payments Validation Rules
 */

'use strict';

const { body } = require('express-validator');

const submitPaymentRules = [
  body('amount')
    .trim()
    .isFloat({ min: 1 }).withMessage('Deposit amount must be a positive number greater than or equal to 1.'),

  body()
    .custom((value, { req }) => {
      const utrNumber = req.body.utrNumber || req.body.utr_number;
      if (!utrNumber || !/^[A-Za-z0-9]{12,20}$/.test(String(utrNumber).trim())) {
        throw new Error('UTR number must be 12 to 20 alphanumeric characters.');
      }
      req.body.utrNumber = String(utrNumber).trim();
      return true;
    }),
];

module.exports = {
  submitPaymentRules,
};
