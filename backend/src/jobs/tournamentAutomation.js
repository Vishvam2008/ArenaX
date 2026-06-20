/**
 * tournamentAutomation.js — Automated Tournament Lifecycle Jobs
 * Runs every 5 minutes to manage checkin window, lobby releases, and registration cutoffs.
 */

'use strict';

const cron = require('node-cron');
const db = require('../config/db');
const { createNotification } = require('../utils/notification');

/**
 * Automates tournament status updates.
 */
async function runTournamentAutomation() {
  console.log('🤖 Running tournament automation job...');

  try {
    // 1. Close registrations for expired windows
    const closeRegRes = await db.query(
      `UPDATE tournaments
       SET status = 'registration_closed', updated_at = NOW()
       WHERE status = 'registration_open' AND NOW() > registration_end_time
       RETURNING id, title`
    );
    if (closeRegRes.rowCount > 0) {
      closeRegRes.rows.forEach((t) => {
        console.log(`🔒 Closed registration for tournament: ${t.title}`);
      });
    }

    // 2. Open check-in (60 minutes prior to match start)
    const openCheckinRes = await db.query(
      `UPDATE tournaments
       SET status = 'checkin_open', updated_at = NOW()
       WHERE status = 'registration_closed'
         AND NOW() >= (match_time - INTERVAL '60 minutes')
         AND NOW() < match_time
       RETURNING id, title`
    );
    if (openCheckinRes.rowCount > 0) {
      for (const t of openCheckinRes.rows) {
        console.log(`🚪 Opened check-in for tournament: ${t.title}`);

        // Notify all registered participants
        const parts = await db.query('SELECT user_id FROM participants WHERE tournament_id = $1', [t.id]);
        for (const p of parts.rows) {
          await createNotification({
            userId: p.user_id,
            title: 'Check-in Open!',
            body: `Check-in is now open for ${t.title}. Please check-in to confirm your seat.`,
            type: 'tournament',
            referenceId: t.id,
            referenceType: 'tournament',
          });
        }
      }
    }

    // 3. Release room credentials (15 minutes prior to match start)
    // Only release if room details have been entered by admin in room_details
    const releaseRoomRes = await db.query(
      `UPDATE tournaments t
       SET status = 'room_released', updated_at = NOW()
       FROM room_details r
       WHERE t.id = r.tournament_id
         AND t.status = 'checkin_open'
         AND NOW() >= (t.match_time - INTERVAL '15 minutes')
         AND NOW() < t.match_time
       RETURNING t.id, t.title, r.room_id`
    );

    if (releaseRoomRes.rowCount > 0) {
      for (const t of releaseRoomRes.rows) {
        console.log(`🎮 Released room for tournament: ${t.title}`);

        // Notify only checked-in participants
        const parts = await db.query(
          'SELECT user_id FROM participants WHERE tournament_id = $1 AND has_checked_in = true',
          [t.id]
        );
        for (const p of parts.rows) {
          await createNotification({
            userId: p.user_id,
            title: 'Lobby Room ID Released!',
            body: `Room ID and password for ${t.title} are now available. Get them in the app!`,
            type: 'tournament',
            referenceId: t.id,
            referenceType: 'tournament',
          });
        }
      }
    }
  } catch (err) {
    console.error('❌ Tournament automation job failed:', err.message);
  }
}

/**
 * Initializes the node-cron scheduler.
 * Runs every 5 minutes.
 */
function initScheduler() {
  // Run once immediately on startup
  runTournamentAutomation();

  // Schedule '*/5 * * * *' (every 5 minutes)
  cron.schedule('*/5 * * * *', runTournamentAutomation);
}

module.exports = {
  initScheduler,
  runTournamentAutomation,
};
