/**
 * migrate.js — Database Migration Runner
 * Reads all SQL files from migrations/ directory, executes them in order,
 * and tracks executed migrations in a migrations_log table.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getClient, query } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

async function runMigrations() {
  console.log('🔄 Starting database migrations...');
  const client = await getClient();

  try {
    // 1. Create migrations log table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Read migration files
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // 3. Fetch already executed migrations
    const { rows } = await client.query('SELECT name FROM migrations_log');
    const executed = new Set(rows.map((r) => r.name));

    // 4. Run new migrations
    for (const file of files) {
      if (executed.has(file)) {
        continue;
      }

      console.log(`⏳ Running migration: ${file}`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute migration in transaction
      await client.query('BEGIN');
      try {
        if (sql.trim()) {
          await client.query(sql);
        }
        await client.query('INSERT INTO migrations_log (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Completed migration: ${file}`);
      } catch (migrationErr) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration failed: ${file}`);
        throw migrationErr;
      }
    }

    console.log('✨ All migrations completed successfully.');
  } catch (err) {
    console.error('❌ Migration runner failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Run migrations if invoked directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = runMigrations;
