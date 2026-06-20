/**
 * users.controller.js — Users HTTP Handlers
 */

'use strict';

const usersService = require('./users.service');
const response = require('../../utils/response');
const { logAudit } = require('../../utils/auditLogger');

async function getProfile(req, res, next) {
  try {
    const profile = await usersService.getProfile(req.user.id);
    return response.success(res, profile, 'Profile retrieved successfully.');
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const updated = await usersService.updateProfile(req.user.id, req.body);
    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'update_profile',
      entityType: 'user',
      entityId: req.user.id,
      payload: req.body,
      req,
    });
    return response.success(res, updated, 'Profile updated successfully.');
  } catch (err) {
    next(err);
  }
}

async function updateAvatar(req, res, next) {
  try {
    const updated = await usersService.updateAvatar(req.user.id, req.file);
    await logAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'update_avatar',
      entityType: 'user',
      entityId: req.user.id,
      req,
    });
    return response.success(res, updated, 'Avatar updated successfully.');
  } catch (err) {
    next(err);
  }
}

async function getStats(req, res, next) {
  try {
    const stats = await usersService.getStats(req.user.id);
    return response.success(res, stats, 'User statistics retrieved.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  updateAvatar,
  getStats,
};
