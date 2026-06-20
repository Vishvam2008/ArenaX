/**
 * payments.routes.js — Payments Endpoints
 */

'use strict';

const express = require('express');
const paymentsController = require('./payments.controller');
const { submitPaymentRules } = require('./payments.validator');
const { validate } = require('../../middleware/validate');
const { uploadLimiter } = require('../../middleware/rateLimiter');
const { authenticateUser } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

const router = express.Router();

router.get('/deposit-info', authenticateUser, paymentsController.getDepositInfo);
router.post(
  '/submit',
  authenticateUser,
  uploadLimiter,
  upload.single('screenshot'),
  submitPaymentRules,
  validate,
  paymentsController.submitPayment
);
router.get('/history', authenticateUser, paymentsController.getPaymentHistory);

module.exports = router;
