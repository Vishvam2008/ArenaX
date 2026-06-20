/**
 * tournaments.routes.js — Tournaments Endpoints
 */

'use strict';

const express = require('express');
const tournamentsController = require('./tournaments.controller');
const { submitResultRules } = require('./tournaments.validator');
const { validate } = require('../../middleware/validate');
const { uploadLimiter } = require('../../middleware/rateLimiter');
const { authenticateUser, optionalAuth } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

const router = express.Router();

router.get('/', tournamentsController.listTournaments);
router.get('/:id', optionalAuth, tournamentsController.getTournament);
router.post('/:id/join', authenticateUser, tournamentsController.joinTournament);
router.post('/:id/checkin', authenticateUser, tournamentsController.checkIn);
router.get('/:id/room', authenticateUser, tournamentsController.getRoomDetails);

router.post(
  '/:id/result',
  authenticateUser,
  uploadLimiter,
  upload.fields([
    { name: 'match_screenshot', maxCount: 1 },
    { name: 'kill_screenshot', maxCount: 1 },
    { name: 'result_screenshot', maxCount: 1 },
  ]),
  submitResultRules,
  validate,
  tournamentsController.submitResult
);

router.get('/:id/participants', tournamentsController.getParticipants);

module.exports = router;
