/**
 * seed.js — Super Admin Seeder
 * Seeds the initial super_admin account into the database if no admins exist.
 * Reads configurations from environment variables.
 */

'use strict';

const bcrypt = require('bcrypt');
const { query } = require('./db');
const env = require('./env');

async function seedSuperAdmin() {
  console.log('🔄 Checking admin accounts...');

  try {
    // 1. Check if any admin already exists
    const adminCheck = await query('SELECT COUNT(*) FROM admins');
    const adminCount = parseInt(adminCheck.rows[0].count, 10);

    if (adminCount > 0) {
      console.log('ℹ️ Admin accounts already exist. Skipping seed.');
      return;
    }

    // 2. Validate env variables for seed
    const username = env.SUPER_ADMIN_USERNAME;
    const email = env.SUPER_ADMIN_EMAIL;
    const password = env.SUPER_ADMIN_PASSWORD;

    if (!username || !email || !password) {
      throw new Error('SUPER_ADMIN_USERNAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD must be defined in env to seed.');
    }

    // 3. Hash password and insert
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    await query(
      `INSERT INTO admins (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'super_admin')`,
      [username, email, passwordHash]
    );

    console.log(`✅ Successfully seeded Super Admin!`);
    console.log(`   Username: ${username}`);
    console.log(`   Email: ${email}`);
    console.log(`⚠️  Please change the default password immediately after logging in.`);
  } catch (err) {
    console.error('❌ Super admin seeding failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedSuperAdmin()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedSuperAdmin;
