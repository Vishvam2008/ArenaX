/**
 * wallet.routes.js — Wallet Endpoints
 */

'use strict';

const express = require('express');
const walletController = require('./wallet.controller');
const { authenticateUser } = require('../../middleware/auth');

const router = express.Router();

router.get('/', authenticateUser, walletController.getWallet);
router.get('/transactions', authenticateUser, walletController.getTransactions);

module.exports = router;
