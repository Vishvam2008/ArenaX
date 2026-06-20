/**
 * tournaments.controller.js — Tournaments HTTP Handlers
 */

'use strict';

const tournamentsService = require('./tournaments.service');
const response = require('../../utils/response');
const { logAudit } = require('../../utils/auditLogger');

async function listTournaments(req, res, next) {
  try {
    const { status, game, matchType, page, limit } = req.query;
    const result = await tournamentsService.listTournaments({ status, game, matchType, page, limit });
    return response.success(res, result, 'Tournaments retrieved successfully.');
  } catch (err) {
    next(err);
  }
}

async function getTournament(req, res, next) {
  try {
    const userId = req.user?.id || null; // optional auth support
    const tournament = await tournamentsService.getTournament(req.params.id, userId);
    return response.success(res, tournament, 'Tournament details retrieved.');
  } catch (err) {
    next(err);
  }
}

async function joinTournament(req, res, next) {
  try {
    const participants = await tournamentsService.joinTournament(req.params.id, req.user.id);

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'join_tournament',
      entityType: 'tournament',
      entityId: req.params.id,
      payload: { registeredCount: participants.length },
      req,
    });

    return response.success(res, participants, 'Successfully registered for the tournament.', 201);
  } catch (err) {
    next(err);
  }
}

async function checkIn(req, res, next) {
  try {
    const participant = await tournamentsService.checkIn(req.params.id, req.user.id);

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'checkin_tournament',
      entityType: 'tournament',
      entityId: req.params.id,
      req,
    });

    return response.success(res, participant, 'Check-in successful.');
  } catch (err) {
    next(err);
  }
}

async function getRoomDetails(req, res, next) {
  try {
    const room = await tournamentsService.getRoomDetails(req.params.id, req.user.id);
    return response.success(res, room, 'Room credentials retrieved.');
  } catch (err) {
    next(err);
  }
}

async function submitResult(req, res, next) {
  try {
    const { rank, kills, gotBooyah } = req.body;
    const result = await tournamentsService.submitResult(req.params.id, req.user.id, {
      rank,
      kills,
      gotBooyah,
      files: req.files,
    });

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'submit_results',
      entityType: 'result',
      entityId: result.id,
      payload: { rank, kills, gotBooyah },
      req,
    });

    return response.success(res, result, 'Results submitted for verification.', 201);
  } catch (err) {
    next(err);
  }
}

async function getParticipants(req, res, next) {
  try {
    const participants = await tournamentsService.getParticipants(req.params.id);
    return response.success(res, participants, 'Participants list retrieved.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listTournaments,
  getTournament,
  joinTournament,
  checkIn,
  getRoomDetails,
  submitResult,
  getParticipants,
};
