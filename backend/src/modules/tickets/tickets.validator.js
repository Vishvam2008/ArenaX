/**
 * tickets.validator.js — Support Tickets Validation Rules
 */

'use strict';

const { body } = require('express-validator');

const createTicketRules = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 }).withMessage('Ticket title must be between 5 and 100 characters long.'),

  body('description')
    .trim()
    .isLength({ min: 10 }).withMessage('Please provide a detailed description of at least 10 characters.'),

  body('category')
    .trim()
    .isIn(['payment', 'tournament', 'reward', 'withdrawal', 'other'])
    .withMessage('Invalid support category selected.'),
];

const addReplyRules = [
  body('message')
    .trim()
    .isLength({ min: 2 }).withMessage('Reply message must be at least 2 characters long.'),
];

module.exports = {
  createTicketRules,
  addReplyRules,
};
