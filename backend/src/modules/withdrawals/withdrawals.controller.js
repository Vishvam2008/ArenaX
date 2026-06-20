/**
 * withdrawals.controller.js — Withdrawals HTTP Handlers
 */

'use strict';

const withdrawalsService = require('./withdrawals.service');
const response = require('../../utils/response');
const { logAudit } = require('../../utils/auditLogger');

async function requestWithdrawal(req, res, next) {
  try {
    const { upiId, amount } = req.body;
    const request = await withdrawalsService.requestWithdrawal(req.user.id, {
      upiId,
      amount,
    });

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'request_withdrawal',
      entityType: 'withdrawal',
      entityId: request.id,
      payload: { amount, upiId },
      req,
    });

    return response.success(res, request, 'Withdrawal request submitted successfully.', 201);
  } catch (err) {
    next(err);
  }
}

async function getWithdrawalHistory(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await withdrawalsService.getWithdrawalHistory(req.user.id, page, limit);
    return response.success(res, result, 'Withdrawal history retrieved.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requestWithdrawal,
  getWithdrawalHistory,
};
