/**
 * wallet.controller.js — Wallet HTTP Handlers
 */

'use strict';

const walletService = require('./wallet.service');
const response = require('../../utils/response');

async function getWallet(req, res, next) {
  try {
    const wallet = await walletService.getWallet(req.user.id);
    return response.success(res, wallet, 'Wallet details retrieved.');
  } catch (err) {
    next(err);
  }
}

async function getTransactions(req, res, next) {
  try {
    const { page, limit, category } = req.query;
    const result = await walletService.getTransactions(req.user.id, { page, limit, category });
    return response.success(res, result, 'Transactions retrieved successfully.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getWallet,
  getTransactions,
};
