/**
 * teams.validator.js — Teams Validation Rules
 */

'use strict';

const { body } = require('express-validator');

const createTeamRules = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Team name must be between 3 and 50 characters long.'),

  body('matchType')
    .trim()
    .isIn(['duo', 'squad']).withMessage('Match type must be either duo or squad.'),
];

const joinTeamRules = [
  body('code')
    .trim()
    .isLength({ min: 8, max: 8 }).withMessage('Team code must be exactly 8 characters long.')
    .isAlphanumeric().withMessage('Team code must contain only letters and numbers.'),
];

module.exports = {
  createTeamRules,
  joinTeamRules,
};
