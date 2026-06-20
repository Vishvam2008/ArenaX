/**
 * notifications.routes.js — Notifications Endpoints
 */

'use strict';

const express = require('express');
const notificationsController = require('./notifications.controller');
const { authenticateUser } = require('../../middleware/auth');

const router = express.Router();

router.get('/', authenticateUser, notificationsController.getNotifications);
router.put('/:id/read', authenticateUser, notificationsController.markRead);
router.put('/read-all', authenticateUser, notificationsController.markAllRead);
router.get('/unread-count', authenticateUser, notificationsController.getUnreadCount);

module.exports = router;
