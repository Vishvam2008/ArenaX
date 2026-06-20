/**
 * tickets.routes.js — Support Tickets Endpoints
 */

'use strict';

const express = require('express');
const ticketsController = require('./tickets.controller');
const { createTicketRules, addReplyRules } = require('./tickets.validator');
const { validate } = require('../../middleware/validate');
const { authenticateUser } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

const router = express.Router();

router.post('/', authenticateUser, upload.single('screenshot'), createTicketRules, validate, ticketsController.createTicket);
router.get('/', authenticateUser, ticketsController.getMyTickets);
router.get('/:id', authenticateUser, ticketsController.getTicket);
router.post('/:id/reply', authenticateUser, addReplyRules, validate, ticketsController.addReply);

module.exports = router;
