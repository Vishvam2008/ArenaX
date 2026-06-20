/**
 * teams.routes.js — Teams Endpoints
 */

'use strict';

const express = require('express');
const teamsController = require('./teams.controller');
const { createTeamRules, joinTeamRules } = require('./teams.validator');
const { validate } = require('../../middleware/validate');
const { authenticateUser } = require('../../middleware/auth');

const router = express.Router();

router.post('/create', authenticateUser, createTeamRules, validate, teamsController.createTeam);
router.post('/join', authenticateUser, joinTeamRules, validate, teamsController.joinTeam);
router.post('/leave', authenticateUser, teamsController.leaveTeam);
router.get('/my', authenticateUser, teamsController.getMyTeam);
router.delete('/:id', authenticateUser, teamsController.disbandTeam);
router.delete('/:id/members/:memberId', authenticateUser, teamsController.kickMember);

module.exports = router;
