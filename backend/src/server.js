/**
 * server.js — Server Entry Point
 * Starts HTTP server, initializes background cron jobs, and orchestrates graceful shutdowns.
 */

'use strict';

const http = require('http');
const app = require('./app');
const env = require('./config/env');
const db = require('./config/db');
const { startJobs } = require('./jobs');

const PORT = env.PORT;

// Create HTTP server
const server = http.createServer(app);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 ArenaX Backend API running in [${env.NODE_ENV}] mode on port ${PORT}`);

  // Initialize automated background tasks
  startJobs();
});

/**
 * Handles graceful shutdown process for the application.
 * Closes the database pools and HTTP connections.
 * @param {string} signal - The signal received (e.g. SIGTERM, SIGINT)
 */
function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Commencing graceful shutdown...`);

  // Set timeout to force exit if closing takes too long
  const forceExitTimeout = setTimeout(() => {
    console.error('⚠️ Graceful shutdown timed out. Forcing termination.');
    process.exit(1);
  }, 10000);

  server.close(async () => {
    console.log('🔒 HTTP server closed.');

    try {
      // Close database pool connections
      await db.pool.end();
      console.log('🔌 PostgreSQL pool connection terminated.');

      clearTimeout(forceExitTimeout);
      console.log('👋 Shutdown complete. Goodbye.');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during pool teardown:', err.message);
      process.exit(1);
    }
  });
}

// OS Signal Listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught Exception and Unhandled Rejection Loggers
process.on('uncaughtException', (err) => {
  console.error('❌ CRITICAL: Uncaught Exception!', err);
  // Optional: Graceful exit since state may be corrupted
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ CRITICAL: Unhandled Promise Rejection at:', promise, 'reason:', reason);
});
