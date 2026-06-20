/**
 * payments.service.js — Payments Service Layer
 */

'use strict';

const uuid = require('uuid');
const db = require('../../config/db');
const storage = require('../../config/storage');
const env = require('../../config/env');
const hashUtil = require('../../utils/hash');

/**
 * Retrieves the platform's deposit information (Merchant UPI ID & QR Code Image).
 */
async function getDepositInfo() {
  const res = await db.query(
    `SELECT key, value FROM settings
     WHERE key IN ('upi_id', 'qr_image_url', 'min_deposit', 'max_deposit')`
  );

  const info = {};
  res.rows.forEach((row) => {
    info[row.key] = row.value;
  });

  return {
    upiId: info.upi_id || 'arenax@upi',
    qrImageUrl: info.qr_image_url || '',
    minDeposit: parseFloat(info.min_deposit || '10'),
    maxDeposit: parseFloat(info.max_deposit || '10000'),
  };
}

/**
 * Submits a new payment deposit request.
 * Enforces deposit limit checks, UTR uniqueness, and screenshot checksum deduplication.
 */
async function submitPayment(userId, { amount, utrNumber, file }) {
  if (!file) {
    throw new Error('Screenshot file is required.');
  }

  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Invalid deposit amount.');
  }

  // 1. Verify deposit limits
  const info = await getDepositInfo();
  if (numericAmount < info.minDeposit || numericAmount > info.maxDeposit) {
    throw new Error(`Deposit amount must be between ₹${info.minDeposit} and ₹${info.maxDeposit}.`);
  }

  // 2. Check for duplicate UTR number
  const utrCheck = await db.query(
    'SELECT id FROM payment_requests WHERE utr_number = $1',
    [utrNumber]
  );
  if (utrCheck.rowCount > 0) {
    throw new Error('This UTR number has already been submitted.');
  }

  // 3. Compute file hash and check for duplicate uploads
  const screenshotHash = hashUtil.generateFileHash(file.buffer);
  const hashCheck = await db.query(
    'SELECT id FROM payment_requests WHERE screenshot_hash = $1',
    [screenshotHash]
  );
  if (hashCheck.rowCount > 0) {
    throw new Error('This screenshot has already been uploaded for another deposit request.');
  }

  // 4. Upload screenshot to Supabase Storage bucket
  const fileId = uuid.v4();
  const fileExt = file.originalname.split('.').pop() || 'jpg';
  const storagePath = `payments/${userId}/${fileId}.${fileExt}`;

  const screenshotUrl = await storage.uploadFile(
    env.SUPABASE_STORAGE_BUCKET,
    storagePath,
    file.buffer,
    file.mimetype
  );

  // 5. Save payment request in database
  const insertRes = await db.query(
    `INSERT INTO payment_requests (user_id, amount, utr_number, screenshot_url, screenshot_hash, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id, amount, utr_number, screenshot_url, status, created_at`,
    [userId, numericAmount, utrNumber, screenshotUrl, screenshotHash]
  );

  return insertRes.rows[0];
}

/**
 * Gets payment history for a user.
 */
async function getPaymentHistory(userId, page = 1, limit = 10) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;

  const result = await db.query(
    `SELECT id, amount, utr_number, screenshot_url, status, admin_note, reviewed_at, created_at
     FROM payment_requests
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limitNum, offset]
  );

  const countRes = await db.query(
    'SELECT COUNT(*) FROM payment_requests WHERE user_id = $1',
    [userId]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  return {
    history: result.rows,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
}

module.exports = {
  getDepositInfo,
  submitPayment,
  getPaymentHistory,
};
