/**
 * withdrawals.routes.js — Withdrawals Endpoints
 */

'use strict';

const express = require('express');
const withdrawalsController = require('./withdrawals.controller');
const { requestWithdrawalRules } = require('./withdrawals.validator');
const { validate } = require('../../middleware/validate');
const { authenticateUser } = require('../../middleware/auth');

const router = express.Router();

router.post(
  '/request',
  authenticateUser,
  requestWithdrawalRules,
  validate,
  withdrawalsController.requestWithdrawal
);
router.get('/history', authenticateUser, withdrawalsController.getWithdrawalHistory);

module.exports = router;
