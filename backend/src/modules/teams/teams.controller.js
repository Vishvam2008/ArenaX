/**
 * teams.controller.js — Teams HTTP Handlers
 */

'use strict';

const teamsService = require('./teams.service');
const response = require('../../utils/response');
const { logAudit } = require('../../utils/auditLogger');

async function createTeam(req, res, next) {
  try {
    const { name, matchType } = req.body;
    const team = await teamsService.createTeam(req.user.id, { name, matchType });

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'create_team',
      entityType: 'team',
      entityId: team.id,
      payload: { name, matchType },
      req,
    });

    return response.success(res, team, 'Team created successfully.', 201);
  } catch (err) {
    next(err);
  }
}

async function joinTeam(req, res, next) {
  try {
    const { code } = req.body;
    const result = await teamsService.joinTeam(req.user.id, code);

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'join_team',
      entityType: 'team',
      entityId: result.team.id,
      req,
    });

    return response.success(res, result, 'Successfully joined the team.');
  } catch (err) {
    next(err);
  }
}

async function leaveTeam(req, res, next) {
  try {
    const result = await teamsService.leaveTeam(req.user.id);

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'leave_team',
      entityType: 'team',
      entityId: result.teamId,
      req,
    });

    return response.success(res, null, 'Successfully left the team.');
  } catch (err) {
    next(err);
  }
}

async function getMyTeam(req, res, next) {
  try {
    const team = await teamsService.getMyTeam(req.user.id);
    return response.success(res, team, 'Team details retrieved.');
  } catch (err) {
    next(err);
  }
}

async function disbandTeam(req, res, next) {
  try {
    const teamId = req.params.id;
    await teamsService.disbandTeam(req.user.id, teamId);

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'disband_team',
      entityType: 'team',
      entityId: teamId,
      req,
    });

    return response.success(res, null, 'Team disbanded successfully.');
  } catch (err) {
    next(err);
  }
}

async function kickMember(req, res, next) {
  try {
    const { id: teamId, memberId } = req.params;
    await teamsService.kickMember(req.user.id, teamId, memberId);

    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'kick_member',
      entityType: 'team',
      entityId: teamId,
      payload: { kickedMemberId: memberId },
      req,
    });

    return response.success(res, null, 'Team member kicked successfully.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTeam,
  joinTeam,
  leaveTeam,
  getMyTeam,
  disbandTeam,
  kickMember,
};
