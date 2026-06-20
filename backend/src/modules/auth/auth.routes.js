/**
 * auth.routes.js — Authentication Endpoints
 */

'use strict';

const express = require('express');
const authController = require('./auth.controller');
const { registerRules, loginRules, forgotPasswordRules, resetPasswordRules } = require('./auth.validator');
const { validate } = require('../../middleware/validate');
const { authLimiter } = require('../../middleware/rateLimiter');
const { authenticateUser } = require('../../middleware/auth');

const router = express.Router();

router.post('/register', authLimiter, registerRules, validate, authController.register);
router.post('/login', authLimiter, loginRules, validate, authController.login);
router.post('/logout', authenticateUser, authController.logout);
router.post('/forgot-password', authLimiter, forgotPasswordRules, validate, authController.forgotPassword);
router.post('/reset-password', resetPasswordRules, validate, authController.resetPassword);
router.post('/refresh', authController.refreshToken);
router.get('/me', authenticateUser, authController.getMe);

module.exports = router;
