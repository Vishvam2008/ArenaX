/**
 * payments.controller.js — Payments HTTP Handlers
 */

'use strict';

const paymentsService = require('./payments.service');
const response = require('../../utils/response');
const { logAudit } = require('../../utils/auditLogger');

async function getDepositInfo(req, res, next) {
  try {
    const info = await paymentsService.getDepositInfo();
    return response.success(res, info, 'Deposit details retrieved.');
  } catch (err) {
    next(err);
  }
}

async function submitPayment(req, res, next) {
  try {
    const { amount, utrNumber } = req.body;
    const request = await paymentsService.submitPayment(req.user.id, {
      amount,
      utrNumber,
      file: req.file,
    });

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'submit_payment',
      entityType: 'payment_request',
      entityId: request.id,
      payload: { amount, utrNumber },
      req,
    });

    return response.success(res, request, 'Deposit request submitted successfully.', 201);
  } catch (err) {
    next(err);
  }
}

async function getPaymentHistory(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await paymentsService.getPaymentHistory(req.user.id, page, limit);
    return response.success(res, result, 'Payment history retrieved.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDepositInfo,
  submitPayment,
  getPaymentHistory,
};
