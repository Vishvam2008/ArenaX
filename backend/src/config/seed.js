/**
 * seed.js — Comprehensive Database Seeder
 * Seeds the initial super_admin, staff, test users, wallets, and tournaments.
 * Runs idempotently.
 */

'use strict';

const bcrypt = require('bcrypt');
const { query } = require('./db');
const env = require('./env');

async function seed() {
  console.log('🔄 Starting comprehensive database seeding...');

  try {
    // 0. Clean database
    console.log('🧹 Cleaning existing tables...');
    await query('TRUNCATE admins, users, wallets, results, participants, team_members, teams, payment_requests, notifications, tournaments, support_tickets, ticket_replies CASCADE');
    console.log('✅ Database cleaned.');

    // 1. Seed Admins
    console.log('⏳ Seeding admins...');
    const superAdminPasswordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD || 'change_me_admin_password', env.BCRYPT_ROUNDS);
    const staffPasswordHash = await bcrypt.hash('change_me_staff_password', env.BCRYPT_ROUNDS);

    const superAdminRes = await query(
      `INSERT INTO admins (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'super_admin')
       RETURNING id`,
      [env.SUPER_ADMIN_USERNAME || 'admin', env.SUPER_ADMIN_EMAIL || 'admin@example.com', superAdminPasswordHash]
    );
    const superAdminId = superAdminRes.rows[0].id;

    const staffRes = await query(
      `INSERT INTO admins (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id`,
      ['staff_moderator', 'staff@example.com', staffPasswordHash]
    );
    const staffId = staffRes.rows[0].id;
    console.log('✅ Admins seeded.');

    // 2. Seed Users (User A, User B, User C)
    console.log('⏳ Seeding test users...');
    const passwordA = await bcrypt.hash('change_me_user_a', env.BCRYPT_ROUNDS);
    const passwordB = await bcrypt.hash('change_me_user_b', env.BCRYPT_ROUNDS);
    const passwordC = await bcrypt.hash('change_me_user_c', env.BCRYPT_ROUNDS);

    const userARes = await query(
      `INSERT INTO users (username, email, password_hash, phone, ff_uid, ff_username, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      ['user_a', 'usera@example.com', passwordA, '9999999991', '11111111', 'FF_User_A']
    );
    const userAId = userARes.rows[0].id;

    const userBRes = await query(
      `INSERT INTO users (username, email, password_hash, phone, ff_uid, ff_username, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      ['user_b', 'userb@example.com', passwordB, '9999999992', '22222222', 'FF_User_B']
    );
    const userBId = userBRes.rows[0].id;

    const userCRes = await query(
      `INSERT INTO users (username, email, password_hash, phone, ff_uid, ff_username, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      ['user_c', 'userc@example.com', passwordC, '9999999993', '33333333', 'FF_User_C']
    );
    const userCId = userCRes.rows[0].id;
    console.log('✅ Users seeded.');

    // 3. Seed Wallets
    console.log('⏳ Seeding wallets...');
    await query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 500.00), ($2, 1000.00), ($3, 150.00)`,
      [userAId, userBId, userCId]
    );
    console.log('✅ Wallets seeded.');

    // 4. Seed Tournaments
    console.log('⏳ Seeding tournaments...');
    const now = new Date();
    const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const inFourDays = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const tournament1Res = await query(
      `INSERT INTO tournaments (title, game, match_type, entry_fee, prize_pool, per_kill_reward, booyah_reward, total_slots, filled_slots, match_time, registration_end_time, status, created_by)
       VALUES ($1, 'free_fire', 'solo', 10.00, 100.00, 2.00, 30.00, 50, 0, $2, $3, 'registration_open', $4)
       RETURNING id`,
      ['Free Fire Solo Clash', inThreeDays, inTwoDays, superAdminId]
    );
    const t1Id = tournament1Res.rows[0].id;

    const tournament2Res = await query(
      `INSERT INTO tournaments (title, game, match_type, entry_fee, prize_pool, per_kill_reward, booyah_reward, total_slots, filled_slots, match_time, registration_end_time, status, created_by)
       VALUES ($1, 'free_fire', 'duo', 20.00, 250.00, 5.00, 70.00, 25, 0, $2, $3, 'upcoming', $4)
       RETURNING id`,
      ['Free Fire Duo Cup Pro', inFourDays, inThreeDays, superAdminId]
    );
    const t2Id = tournament2Res.rows[0].id;

    const tournament3Res = await query(
      `INSERT INTO tournaments (title, game, match_type, entry_fee, prize_pool, per_kill_reward, booyah_reward, total_slots, filled_slots, match_time, registration_end_time, status, created_by)
       VALUES ($1, 'free_fire', 'squad', 50.00, 1000.00, 10.00, 300.00, 12, 1, $2, $3, 'completed', $4)
       RETURNING id`,
      ['Free Fire Squad Showdown', yesterday, yesterday, superAdminId]
    );
    const t3Id = tournament3Res.rows[0].id;
    console.log('✅ Tournaments seeded.');

    // 5. Seed Payment Requests
    console.log('⏳ Seeding payment requests...');
    await query(
      `INSERT INTO payment_requests (user_id, amount, utr_number, screenshot_url, screenshot_hash, status, created_at)
       VALUES 
       ($1, 100.00, 'UTR123456001', 'http://example.com/screenshot1.jpg', 'dummy_hash_1', 'pending', $4),
       ($2, 500.00, 'UTR123456002', 'http://example.com/screenshot2.jpg', 'dummy_hash_2', 'approved', $4),
       ($3, 50.00, 'UTR123456003', 'http://example.com/screenshot3.jpg', 'dummy_hash_3', 'rejected', $4)`,
      [userAId, userBId, userCId, now]
    );
    console.log('✅ Payment requests seeded.');

    // 6. Seed Results
    console.log('⏳ Seeding tournament results...');
    await query(
      `INSERT INTO results (tournament_id, user_id, rank, kills, got_booyah, is_mvp, status, reviewed_by, reviewed_at)
       VALUES 
       ($1, $2, 1, 8, true, true, 'approved', $3, $4),
       ($1, $5, 2, 4, false, false, 'approved', $3, $4)`,
      [t3Id, userBId, superAdminId, now, userAId]
    );
    console.log('✅ Results seeded.');

    // 7. Seed Notifications
    console.log('⏳ Seeding notifications...');
    await query(
      `INSERT INTO notifications (user_id, title, body, type, is_read)
       VALUES 
       ($1, 'Welcome to ArenaX!', 'Your account has been successfully created. Explore tournaments now!', 'system', false),
       ($2, 'Deposit Approved!', 'Your deposit of Rs 500 has been approved and credited to your wallet.', 'payment', true)`,
      [userAId, userBId]
    );
    console.log('✅ Notifications seeded.');

    console.log('✨ All seeding completed successfully.');
  } catch (err) {
    console.error('❌ Database seeding failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seed;
