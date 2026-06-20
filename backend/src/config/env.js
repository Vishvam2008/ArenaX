/**
 * env.js — Environment variable loader and validator
 * Loads .env file and validates all required variables at startup.
 * Throws a descriptive error listing every missing variable if any are absent.
 */

'use strict';

require('dotenv').config();

/** All variables that MUST be present for the server to start */
const required = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_EXPIRES',
  'JWT_REFRESH_EXPIRES',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'BCRYPT_ROUNDS',
  'CORS_ORIGIN',
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error('\n❌  Missing required environment variables:');
  missing.forEach((key) => console.error(`   - ${key}`));
  console.error('\n   Copy .env.example to .env and fill in all required values.\n');
  process.exit(1);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: parseInt(process.env.PORT, 10) || 5000,

  DATABASE_URL: process.env.DATABASE_URL,

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES,
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES,

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET,

  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  CORS_ORIGIN: process.env.CORS_ORIGIN,

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,

  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_USERNAME: process.env.SUPER_ADMIN_USERNAME,
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD,

  MIN_DEPOSIT: parseFloat(process.env.MIN_DEPOSIT) || 10,
  MAX_DEPOSIT: parseFloat(process.env.MAX_DEPOSIT) || 10000,
  MIN_WITHDRAWAL: parseFloat(process.env.MIN_WITHDRAWAL) || 50,
  MAX_WITHDRAWAL: parseFloat(process.env.MAX_WITHDRAWAL) || 5000,

  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
};
