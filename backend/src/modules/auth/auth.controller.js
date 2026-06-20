/**
 * auth.controller.js — Authentication HTTP Handlers
 */

'use strict';

const authService = require('./auth.service');
const response = require('../../utils/response');
const { logAudit } = require('../../utils/auditLogger');
const db = require('../../config/db');

const COOKIE_NAME = 'refreshToken';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

async function register(req, res, next) {
  try {
    const user = await authService.registerUser(req.body);
    await logAudit({
      actorType: 'user',
      actorId: user.id,
      action: 'register',
      entityType: 'user',
      entityId: user.id,
      payload: { username: user.username, email: user.email },
      req,
    });
    return response.success(res, user, 'Registration successful.', 201);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.loginUser(email, password);

    // Set refresh token in httpOnly cookie
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);

    await logAudit({
      actorType: 'user',
      actorId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      req,
    });

    return response.success(res, { user, accessToken }, 'Login successful.');
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const userId = req.user?.id;
    if (userId) {
      await logAudit({
        actorType: 'user',
        actorId: userId,
        action: 'logout',
        entityType: 'user',
        entityId: userId,
        req,
      });
    }

    res.clearCookie(COOKIE_NAME);
    return response.success(res, null, 'Logged out successfully.');
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const token = await authService.forgotPassword(email);

    // For public beta we return the token in the response so the user can copy it
    // In a final production setup, this would be emailed instead.
    return response.success(
      res,
      { token },
      'Reset token generated successfully. In production, this would be sent to your email.'
    );
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    return response.success(res, null, 'Password reset successful.');
  } catch (err) {
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    // Read from cookie first, fallback to request body
    const token = req.cookies?.[COOKIE_NAME] || req.body.refreshToken;
    if (!token) {
      return response.error(res, 'Refresh token not found.', 401);
    }

    const newAccessToken = await authService.refreshAccessToken(token);
    return response.success(res, { accessToken: newAccessToken }, 'Token refreshed.');
  } catch (err) {
    // If validation of refresh token fails, clear the cookie
    res.clearCookie(COOKIE_NAME);
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.phone, u.ff_uid, u.ff_username, u.avatar_url, u.created_at,
              w.balance AS wallet_balance
       FROM users u
       JOIN wallets w ON w.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return response.error(res, 'User profile not found.', 404);
    }

    return response.success(res, result.rows[0], 'User profile retrieved.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  refreshToken,
  getMe,
};
