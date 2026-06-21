/**
 * tournaments.service.js — Tournaments Service Layer
 */

'use strict';

const uuid = require('uuid');
const db = require('../../config/db');
const walletUtil = require('../../utils/wallet');
const storage = require('../../config/storage');
const env = require('../../config/env');
const { createNotification } = require('../../utils/notification');

/**
 * Retrieves a list of paginated tournaments, with optional filters.
 */
async function listTournaments({ status, game, matchType, page = 1, limit = 10 }) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;

  let queryText = 'SELECT * FROM tournaments WHERE 1=1';
  const params = [];

  if (status) {
    params.push(status);
    queryText += ` AND status = $${params.length}`;
  }
  if (game) {
    params.push(game);
    queryText += ` AND game = $${params.length}`;
  }
  if (matchType) {
    params.push(matchType);
    queryText += ` AND match_type = $${params.length}`;
  }

  queryText += ` ORDER BY match_time ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const queryParams = [...params, limitNum, offset];

  const result = await db.query(queryText, queryParams);

  // Count query
  let countQuery = 'SELECT COUNT(*) FROM tournaments WHERE 1=1';
  for (let i = 1; i <= params.length; i++) {
    const filterField = i === 1 && status ? 'status' : (i === 2 && game ? 'game' : 'match_type');
    countQuery += ` AND ${filterField} = $${i}`;
  }
  const countRes = await db.query(countQuery, params);
  const total = parseInt(countRes.rows[0].count, 10);

  return {
    tournaments: result.rows,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
}

/**
 * Retrieves a single tournament. If userId is provided, returns registration details.
 */
async function getTournament(id, userId = null) {
  const tRes = await db.query('SELECT * FROM tournaments WHERE id = $1', [id]);
  if (tRes.rowCount === 0) {
    throw new Error('Tournament not found.');
  }

  const tournament = tRes.rows[0];

  if (userId) {
    const pRes = await db.query(
      `SELECT slot_number, has_checked_in, joined_at
       FROM participants
       WHERE tournament_id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (pRes.rowCount > 0) {
      tournament.isRegistered = true;
      tournament.registrationDetails = pRes.rows[0];
    } else {
      tournament.isRegistered = false;
      tournament.registrationDetails = null;
    }
  }

  return tournament;
}

/**
 * Handles tournament registration for Solo, Duo, or Squad teams.
 * Implements atomic slot locking, wallet debits, and notification dispatches.
 */
async function joinTournament(tournamentId, userId) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Fetch and lock tournament row
    const tRes = await client.query(
      'SELECT * FROM tournaments WHERE id = $1 FOR UPDATE',
      [tournamentId]
    );
    if (tRes.rowCount === 0) {
      throw new Error('Tournament not found.');
    }
    const tournament = tRes.rows[0];

    // Validate tournament status
    if (tournament.status !== 'registration_open') {
      throw new Error('Registration is not open for this tournament.');
    }
    if (new Date() > new Date(tournament.registration_end_time)) {
      throw new Error('Registration deadline has passed.');
    }

    // 2. Fetch user information
    const userRes = await client.query(
      'SELECT id, username, is_banned, is_active FROM users WHERE id = $1',
      [userId]
    );
    const user = userRes.rows[0];
    if (user.is_banned || !user.is_active) {
      throw new Error('Your account is banned or inactive.');
    }

    // 3. Handle registration by match type (Solo vs Duo/Squad Teams)
    const matchType = tournament.match_type;
    let participantIds = [userId];
    let teamId = null;

    if (matchType !== 'solo') {
      // User must be captain of a team of the matching size
      const expectedMembers = matchType === 'duo' ? 2 : 4;
      const teamRes = await client.query(
        'SELECT id, max_members FROM teams WHERE captain_id = $1',
        [userId]
      );

      if (teamRes.rowCount === 0) {
        throw new Error('You must be a team captain to register a team for Duo or Squad matches.');
      }

      const team = teamRes.rows[0];
      teamId = team.id;

      // Fetch team members
      const membersRes = await client.query(
        'SELECT user_id FROM team_members WHERE team_id = $1',
        [teamId]
      );

      if (membersRes.rowCount !== expectedMembers) {
        throw new Error(`Your team must have exactly ${expectedMembers} members to register for this match type.`);
      }

      participantIds = membersRes.rows.map((m) => m.user_id);
    }

    // 4. Verify slots availability
    const requiredSlots = participantIds.length;
    if (tournament.filled_slots + requiredSlots > tournament.total_slots) {
      throw new Error('Insufficient registration slots remaining in this tournament.');
    }

    // 5. Check if any participant is already registered in this tournament
    const placeholders = participantIds.map((_, i) => `$${i + 2}`).join(', ');
    const dupCheck = await client.query(
      `SELECT u.username FROM participants p
       JOIN users u ON u.id = p.user_id
       WHERE p.tournament_id = $1 AND p.user_id IN (${placeholders})`,
      [tournamentId, ...participantIds]
    );

    if (dupCheck.rowCount > 0) {
      const names = dupCheck.rows.map((r) => r.username).join(', ');
      throw new Error(`The following team members are already registered: ${names}`);
    }

    // 6. Deduct Entry Fees (Charged to the captain/registering user for all members)
    const totalEntryFee = parseFloat(tournament.entry_fee) * requiredSlots;
    if (totalEntryFee > 0) {
      await walletUtil.debitWallet(
        userId,
        totalEntryFee,
        'entry_fee',
        tournamentId,
        'tournament',
        `Entry fee for tournament: ${tournament.title} (${matchType.toUpperCase()})`,
        client
      );
    }

    // 7. Auto-allocate slots and insert participants
    const participantsList = [];
    let captainSlotNumber = null;

    for (let idx = 0; idx < participantIds.length; idx++) {
      const pId = participantIds[idx];

      // Find the next available slot number
      const slotRes = await client.query(
        'SELECT COALESCE(MAX(slot_number), 0) + 1 AS next_slot FROM participants WHERE tournament_id = $1',
        [tournamentId]
      );
      const slotNumber = parseInt(slotRes.rows[0].next_slot, 10);

      const pInsert = await client.query(
        `INSERT INTO participants (tournament_id, user_id, team_id, slot_number, payment_deducted)
         VALUES ($1, $2, $3, $4, true)
         RETURNING *`,
        [tournamentId, pId, teamId, slotNumber]
      );

      participantsList.push(pInsert.rows[0]);
      if (idx === 0) {
        captainSlotNumber = slotNumber;
      }
    }

    // 8. Update filled slots count on tournament
    await client.query(
      'UPDATE tournaments SET filled_slots = filled_slots + $1, updated_at = NOW() WHERE id = $2',
      [requiredSlots, tournamentId]
    );

    await client.query('COMMIT');

    // Send notifications outside transaction
    for (const pId of participantIds) {
      await createNotification({
        userId: pId,
        title: 'Joined Tournament!',
        body: `You have successfully joined the tournament: ${tournament.title}.`,
        type: 'tournament',
        referenceId: tournamentId,
        referenceType: 'tournament',
      });
    }

    return {
      participants: participantsList,
      captainSlotNumber,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Updates participant's has_checked_in state.
 */
async function checkIn(tournamentId, userId) {
  // Validate tournament status
  const tRes = await db.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
  if (tRes.rowCount === 0) {
    throw new Error('Tournament not found.');
  }

  if (tRes.rows[0].status !== 'checkin_open') {
    throw new Error('Check-in is not open for this tournament.');
  }

  const result = await db.query(
    `UPDATE participants
     SET has_checked_in = true, checked_in_at = NOW()
     WHERE tournament_id = $1 AND user_id = $2 AND has_checked_in = false
     RETURNING *`,
    [tournamentId, userId]
  );

  if (result.rowCount === 0) {
    throw new Error('Check-in failed. Verify you are registered and not already checked in.');
  }

  await createNotification({
    userId,
    title: 'Checked In!',
    body: 'You have checked in successfully. Room details will be released shortly.',
    type: 'tournament',
    referenceId: tournamentId,
    referenceType: 'tournament',
  });

  return result.rows[0];
}

/**
 * Retrieves the room credentials for checked-in participants.
 */
async function getRoomDetails(tournamentId, userId) {
  // Verify participant check-in
  const pCheck = await db.query(
    'SELECT has_checked_in FROM participants WHERE tournament_id = $1 AND user_id = $2',
    [tournamentId, userId]
  );

  if (pCheck.rowCount === 0 || !pCheck.rows[0].has_checked_in) {
    throw new Error('Access denied. You must be registered and checked in to view room details.');
  }

  // Verify tournament status
  const tRes = await db.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
  const status = tRes.rows[0]?.status;

  if (status !== 'room_released' && status !== 'live' && status !== 'result_verification') {
    throw new Error('Room credentials have not been released yet.');
  }

  const rRes = await db.query(
    'SELECT room_id, room_password, released_at FROM room_details WHERE tournament_id = $1',
    [tournamentId]
  );

  if (rRes.rowCount === 0) {
    throw new Error('Room details are missing. Please contact support.');
  }

  return rRes.rows[0];
}

/**
 * Submits match screenshots and results for admin review.
 */
async function submitResult(tournamentId, userId, { rank, kills, gotBooyah, files }) {
  // 1. Verify user is registered participant
  const pCheck = await db.query(
    'SELECT id FROM participants WHERE tournament_id = $1 AND user_id = $2',
    [tournamentId, userId]
  );
  if (pCheck.rowCount === 0) {
    throw new Error('You are not a registered participant in this tournament.');
  }

  // 2. Verify tournament status
  const tRes = await db.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
  if (tRes.rowCount === 0) {
    throw new Error('Tournament not found.');
  }
  const status = tRes.rows[0].status;
  if (status !== 'result_verification' && status !== 'live') {
    throw new Error('Tournament results submission is not open.');
  }

  // 3. Check for existing submission
  const dupCheck = await db.query(
    'SELECT id FROM results WHERE tournament_id = $1 AND user_id = $2',
    [tournamentId, userId]
  );
  if (dupCheck.rowCount > 0) {
    throw new Error('You have already submitted your results for this tournament.');
  }

  // 4. Upload screenshots to Supabase Storage
  let matchScreenshotUrl = null;
  let killScreenshotUrl = null;
  let resultScreenshotUrl = null;

  const uploadFileSafe = async (file, name) => {
    if (!file) return null;
    const fileExt = file.originalname.split('.').pop() || 'jpg';
    const storagePath = `results/${tournamentId}/${userId}_${name}_${Date.now()}.${fileExt}`;
    return storage.uploadFile(env.SUPABASE_STORAGE_BUCKET, storagePath, file.buffer, file.mimetype);
  };

  if (files) {
    matchScreenshotUrl = await uploadFileSafe(files.match_screenshot?.[0], 'match');
    killScreenshotUrl = await uploadFileSafe(files.kill_screenshot?.[0], 'kill');
    resultScreenshotUrl = await uploadFileSafe(files.result_screenshot?.[0], 'result');
  }

  // 5. Insert result record
  const resultInsert = await db.query(
    `INSERT INTO results (tournament_id, user_id, rank, kills, got_booyah, match_screenshot_url, kill_screenshot_url, result_screenshot_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     RETURNING *`,
    [
      tournamentId,
      userId,
      parseInt(rank, 10) || null,
      parseInt(kills, 10) || 0,
      gotBooyah === 'true' || gotBooyah === true,
      matchScreenshotUrl,
      killScreenshotUrl,
      resultScreenshotUrl,
    ]
  );

  return resultInsert.rows[0];
}

/**
 * Retrieves the participants list of a tournament.
 */
async function getParticipants(tournamentId) {
  const res = await db.query(
    `SELECT p.slot_number, p.has_checked_in, p.joined_at, u.username, u.ff_username
     FROM participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.tournament_id = $1
     ORDER BY p.slot_number ASC`,
    [tournamentId]
  );
  return res.rows;
}

module.exports = {
  listTournaments,
  getTournament,
  joinTournament,
  checkIn,
  getRoomDetails,
  submitResult,
  getParticipants,
};
