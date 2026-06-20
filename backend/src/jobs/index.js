/**
 * jobs/index.js — Background Job Bootstrapping
 */

'use strict';

const tournamentAutomation = require('./tournamentAutomation');

/**
 * Starts all scheduled background processes.
 */
function startJobs() {
  console.log('⏰ Initializing automated cron schedulers...');
  tournamentAutomation.initScheduler();
}

module.exports = {
  startJobs,
};
