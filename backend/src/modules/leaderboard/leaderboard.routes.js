/**
 * leaderboard.routes.js — Leaderboard Endpoints
 */

'use strict';

const express = require('express');
const leaderboardController = require('./leaderboard.controller');
const { authenticateAdmin } = require('../../middleware/auth');

const router = express.Router();

router.get('/', leaderboardController.getLeaderboard);
router.post('/refresh', authenticateAdmin, leaderboardController.refreshLeaderboard);

module.exports = router;
