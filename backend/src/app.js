/**
 * app.js — Express Application Configurator
 */

'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimiter');
const { authenticateAdmin } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Import routers
const authRouter = require('./modules/auth/auth.routes');
const usersRouter = require('./modules/users/users.routes');
const walletRouter = require('./modules/wallet/wallet.routes');
const paymentsRouter = require('./modules/payments/payments.routes');
const withdrawalsRouter = require('./modules/withdrawals/withdrawals.routes');
const tournamentsRouter = require('./modules/tournaments/tournaments.routes');
const teamsRouter = require('./modules/teams/teams.routes');
const leaderboardRouter = require('./modules/leaderboard/leaderboard.routes');
const notificationsRouter = require('./modules/notifications/notifications.routes');
const apkRouter = require('./modules/apk/apk.routes');
const ticketsRouter = require('./modules/tickets/tickets.routes');
const adminRouter = require('./modules/admin/admin.routes');

const app = express();

// 1. Security Headers via Helmet
app.use(helmet());

// 2. CORS configurations with whitelist support
const corsWhitelist = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin || corsWhitelist.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy.'));
      }
    },
    credentials: true,
  })
);

// 3. Body parsers and cookie helpers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// 4. Health Check Endpoint (Bypasses rate limiting for monitoring tools)
app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date(),
  });
});

// 5. Apply Rate Limiting to all API routes
app.use('/api', apiLimiter);

// 6. Mount Feature Module Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/withdrawals', withdrawalsRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/apk', apkRouter);
app.use('/api/tickets', ticketsRouter);

// Admin endpoints
app.use('/api/admin', adminRouter);

// 7. Route Not Found (404) Handler
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// 8. Global Error Handler
app.use(errorHandler);

module.exports = app;
