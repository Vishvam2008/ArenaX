/**
 * tickets.controller.js — Support Tickets HTTP Handlers
 */

'use strict';

const ticketsService = require('./tickets.service');
const response = require('../../utils/response');
const { logAudit } = require('../../utils/auditLogger');

async function createTicket(req, res, next) {
  try {
    const { title, description, category } = req.body;
    const ticket = await ticketsService.createTicket(req.user.id, {
      title,
      description,
      category,
      file: req.file,
    });

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'create_support_ticket',
      entityType: 'support_ticket',
      entityId: ticket.id,
      payload: { title, category },
      req,
    });

    return response.success(res, ticket, 'Support ticket created successfully.', 201);
  } catch (err) {
    next(err);
  }
}

async function getMyTickets(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await ticketsService.getMyTickets(req.user.id, page, limit);
    return response.success(res, result, 'Support tickets retrieved.');
  } catch (err) {
    next(err);
  }
}

async function getTicket(req, res, next) {
  try {
    const ticket = await ticketsService.getTicket(req.params.id, req.user.id);
    return response.success(res, ticket, 'Support ticket details retrieved.');
  } catch (err) {
    next(err);
  }
}

async function addReply(req, res, next) {
  try {
    const { message } = req.body;
    const reply = await ticketsService.addReply(req.params.id, req.user.id, message);

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'reply_support_ticket',
      entityType: 'support_ticket',
      entityId: req.params.id,
      req,
    });

    return response.success(res, reply, 'Reply added successfully.', 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTicket,
  getMyTickets,
  getTicket,
  addReply,
};
