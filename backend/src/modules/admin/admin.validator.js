/**
 * admin.validator.js — Administrator Input Validation Rules
 */

'use strict';

const { body } = require('express-validator');

const adminLoginRules = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid admin email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.'),
];

const walletAdjustmentRules = [
  body('amount')
    .trim()
    .isFloat({ min: 1 }).withMessage('Adjustment amount must be a positive number greater than or equal to 1.'),

  body('note')
    .trim()
    .isLength({ min: 3 }).withMessage('Audit note is required for ledger adjustments (min 3 chars).'),
];

const rejectRequestRules = [
  body('adminNote')
    .trim()
    .isLength({ min: 5 }).withMessage('A rejection reason (min 5 characters) must be provided in the admin note.'),
];

const createTournamentRules = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 150 }).withMessage('Tournament title must be between 5 and 150 characters long.'),

  body('matchType')
    .trim()
    .isIn(['solo', 'duo', 'squad']).withMessage('Match type must be solo, duo, or squad.'),

  body('totalSlots')
    .isInt({ min: 2, max: 200 }).withMessage('Total slots must be an integer between 2 and 200.'),

  body('entryFee')
    .isFloat({ min: 0 }).withMessage('Entry fee must be a non-negative number.'),

  body('prizePool')
    .isFloat({ min: 0 }).withMessage('Prize pool must be a non-negative number.'),

  body('matchTime')
    .isISO8601().withMessage('Please provide a valid ISO8601 match date and time.'),

  body('registrationEndTime')
    .isISO8601().withMessage('Please provide a valid ISO8601 registration end date and time.'),
];

const roomDetailsRules = [
  body('roomId')
    .trim()
    .notEmpty().withMessage('Game Lobby Room ID is required.'),

  body('roomPassword')
    .trim()
    .notEmpty().withMessage('Game Lobby Password is required.'),
];

const uploadApkRules = [
  body('versionName')
    .trim()
    .matches(/^\d+\.\d+\.\d+$/).withMessage('Version name must follow semantic versioning syntax (e.g. 1.0.4).'),

  body('versionCode')
    .isInt({ min: 1 }).withMessage('Version code must be an integer greater than 0.'),

  body('changelog')
    .trim()
    .isLength({ min: 5 }).withMessage('Changelog description of at least 5 characters is required.'),
];

const updateSettingRules = [
  body('value')
    .trim()
    .notEmpty().withMessage('Setting value cannot be empty.'),
];

const adminReplyRules = [
  body('message')
    .trim()
    .isLength({ min: 2 }).withMessage('Admin reply must be at least 2 characters long.'),
];

module.exports = {
  adminLoginRules,
  walletAdjustmentRules,
  rejectRequestRules,
  createTournamentRules,
  roomDetailsRules,
  uploadApkRules,
  updateSettingRules,
  adminReplyRules,
};
