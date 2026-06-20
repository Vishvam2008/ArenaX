/**
 * teams.service.js — Teams Service Layer
 */

'use strict';

const crypto = require('crypto');
const db = require('../../config/db');

/** Helper to generate a random 8-character alphanumeric team code */
function generateTeamCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Creates a new team and adds the captain as the first member.
 */
async function createTeam(userId, { name, matchType }) {
  const maxMembers = matchType === 'solo' ? 1 : (matchType === 'duo' ? 2 : 4);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Check if user is already in any team
    const checkRes = await client.query(
      'SELECT id FROM team_members WHERE user_id = $1',
      [userId]
    );
    if (checkRes.rowCount > 0) {
      throw new Error('You are already in a team. You must leave your current team first.');
    }

    // 2. Generate a unique team code
    let code = generateTeamCode();
    let codeCheck = await client.query('SELECT id FROM teams WHERE code = $1', [code]);
    let retries = 0;
    while (codeCheck.rowCount > 0 && retries < 10) {
      code = generateTeamCode();
      codeCheck = await client.query('SELECT id FROM teams WHERE code = $1', [code]);
      retries++;
    }

    // 3. Create the team
    const teamInsert = await client.query(
      `INSERT INTO teams (name, code, captain_id, max_members)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, code, userId, maxMembers]
    );

    const team = teamInsert.rows[0];

    // 4. Add captain as member
    await client.query(
      `INSERT INTO team_members (team_id, user_id)
       VALUES ($1, $2)`,
      [team.id, userId]
    );

    await client.query('COMMIT');
    return team;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Adds a user to a team using the team code.
 */
async function joinTeam(userId, code) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Check if user is already in any team
    const memberCheck = await client.query(
      'SELECT id FROM team_members WHERE user_id = $1',
      [userId]
    );
    if (memberCheck.rowCount > 0) {
      throw new Error('You are already in a team. You must leave your current team first.');
    }

    // 2. Find team by code and lock it
    const teamRes = await client.query(
      'SELECT * FROM teams WHERE code = $1 FOR UPDATE',
      [code.trim().toUpperCase()]
    );
    if (teamRes.rowCount === 0) {
      throw new Error('Invalid team code. Team not found.');
    }
    const team = teamRes.rows[0];

    // 3. Check if team is full
    const countRes = await client.query(
      'SELECT COUNT(*) FROM team_members WHERE team_id = $1',
      [team.id]
    );
    const memberCount = parseInt(countRes.rows[0].count, 10);
    if (memberCount >= team.max_members) {
      throw new Error('This team is already full.');
    }

    // 4. Add member
    const insertRes = await client.query(
      `INSERT INTO team_members (team_id, user_id)
       VALUES ($1, $2)
       RETURNING *`,
      [team.id, userId]
    );

    await client.query('COMMIT');
    return { team, member: insertRes.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Removes a user from their current team.
 * disbands team if user is captain and sole member.
 * errors out if captain leaves but other members remain (captain must disband or transfer captaincy).
 */
async function leaveTeam(userId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Find user's team
    const tmRes = await client.query(
      'SELECT team_id FROM team_members WHERE user_id = $1',
      [userId]
    );
    if (tmRes.rowCount === 0) {
      throw new Error('You are not currently in any team.');
    }
    const teamId = tmRes.rows[0].team_id;

    // Fetch team and lock it
    const teamRes = await client.query(
      'SELECT id, captain_id FROM teams WHERE id = $1 FOR UPDATE',
      [teamId]
    );
    const team = teamRes.rows[0];

    // Fetch all members count
    const countRes = await client.query(
      'SELECT COUNT(*) FROM team_members WHERE team_id = $1',
      [teamId]
    );
    const totalMembers = parseInt(countRes.rows[0].count, 10);

    // 2. Handle logic if user is the captain
    if (team.captain_id === userId) {
      if (totalMembers > 1) {
        throw new Error('As captain, you cannot leave the team while other members are in it. You must disband the team instead.');
      } else {
        // Disband (delete team, member row will cascade delete)
        await client.query('DELETE FROM teams WHERE id = $1', [teamId]);
      }
    } else {
      // Ordinary member leaving
      await client.query(
        'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
        [teamId, userId]
      );
    }

    await client.query('COMMIT');
    return { teamId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves the authenticated user's team details and member list.
 */
async function getMyTeam(userId) {
  // Find team_id
  const tmRes = await db.query(
    'SELECT team_id FROM team_members WHERE user_id = $1',
    [userId]
  );
  if (tmRes.rowCount === 0) {
    return null; // Not in any team
  }
  const teamId = tmRes.rows[0].team_id;

  // Fetch team details
  const teamRes = await db.query(
    `SELECT t.id, t.name, t.code, t.captain_id, t.max_members, t.created_at,
            u.username AS captain_username
     FROM teams t
     JOIN users u ON u.id = t.captain_id
     WHERE t.id = $1`,
    [teamId]
  );
  const team = teamRes.rows[0];

  // Fetch all team members profiles
  const membersRes = await db.query(
    `SELECT tm.joined_at, u.id AS user_id, u.username, u.ff_username, u.ff_uid, u.avatar_url
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.joined_at ASC`,
    [teamId]
  );

  team.members = membersRes.rows;
  return team;
}

/**
 * Disbands a team. Must be the captain to perform.
 */
async function disbandTeam(userId, teamId) {
  const result = await db.query(
    'DELETE FROM teams WHERE id = $1 AND captain_id = $2 RETURNING id',
    [teamId, userId]
  );

  if (result.rowCount === 0) {
    throw new Error('Disband failed. Team not found or you are not the captain.');
  }

  return { teamId };
}

/**
 * Kicks a member from the team. Must be the captain.
 */
async function kickMember(captainId, teamId, memberId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Verify team and captaincy
    const teamRes = await client.query(
      'SELECT id, captain_id FROM teams WHERE id = $1',
      [teamId]
    );
    if (teamRes.rowCount === 0 || teamRes.rows[0].captain_id !== captainId) {
      throw new Error('Access denied. Team not found or you are not the captain.');
    }

    if (captainId === memberId) {
      throw new Error('You cannot kick yourself from the team.');
    }

    // 2. Remove member
    const deleteRes = await client.query(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING id',
      [teamId, memberId]
    );

    if (deleteRes.rowCount === 0) {
      throw new Error('Member not found in this team.');
    }

    await client.query('COMMIT');
    return { memberId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createTeam,
  joinTeam,
  leaveTeam,
  getMyTeam,
  disbandTeam,
  kickMember,
};
