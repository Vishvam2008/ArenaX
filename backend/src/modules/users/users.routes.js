/**
 * users.routes.js — Users Endpoints
 */

'use strict';

const express = require('express');
const usersController = require('./users.controller');
const { updateProfileRules } = require('./users.validator');
const { validate } = require('../../middleware/validate');
const { uploadLimiter } = require('../../middleware/rateLimiter');
const { authenticateUser } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

const router = express.Router();

router.get('/profile', authenticateUser, usersController.getProfile);
router.put('/profile', authenticateUser, updateProfileRules, validate, usersController.updateProfile);
router.post('/avatar', authenticateUser, uploadLimiter, upload.single('avatar'), usersController.updateAvatar);
router.get('/stats', authenticateUser, usersController.getStats);

module.exports = router;
