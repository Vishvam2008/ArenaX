/**
 * admin.routes.js — Administrator Endpoints
 */

'use strict';

const express = require('express');
const adminController = require('./admin.controller');
const {
  adminLoginRules,
  walletAdjustmentRules,
  rejectRequestRules,
  createTournamentRules,
  roomDetailsRules,
  uploadApkRules,
  updateSettingRules,
  adminReplyRules,
} = require('./admin.validator');
const { validate } = require('../../middleware/validate');
const { adminLimiter } = require('../../middleware/rateLimiter');
const { authenticateAdmin } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/rbac');
const upload = require('../../middleware/upload');

const router = express.Router();

// 1. Admin Authentication
router.post('/login', adminLimiter, adminLoginRules, validate, adminController.adminLogin);
router.post('/logout', authenticateAdmin, adminController.adminLogout);
router.get('/me', authenticateAdmin, adminController.getAdminProfile);

// 2. User Management
router.get('/users', authenticateAdmin, adminController.listUsers);
router.get('/users/:id', authenticateAdmin, adminController.getUserDetail);
router.put('/users/:id/ban', authenticateAdmin, adminController.banUser);
router.put('/users/:id/unban', authenticateAdmin, adminController.unbanUser);

// 3. Wallet / Ledger Controls
router.post('/wallets/:id/credit', authenticateAdmin, requireSuperAdmin, walletAdjustmentRules, validate, adminController.adminCreditWallet);
router.post('/wallets/:id/debit', authenticateAdmin, requireSuperAdmin, walletAdjustmentRules, validate, adminController.adminDebitWallet);
router.put('/wallets/:id/freeze', authenticateAdmin, adminController.freezeWallet);
router.put('/wallets/:id/unfreeze', authenticateAdmin, adminController.unfreezeWallet);
router.put('/wallets/:id/block-withdrawals', authenticateAdmin, adminController.blockWithdrawals);

// 4. Manual Payment Verification
router.get('/payments', authenticateAdmin, adminController.listPayments);
router.put('/payments/:id/approve', authenticateAdmin, adminController.approvePayment);
router.put('/payments/:id/reject', authenticateAdmin, rejectRequestRules, validate, adminController.rejectPayment);

// 5. Withdrawal Requests
router.get('/withdrawals', authenticateAdmin, adminController.listWithdrawals);
router.put('/withdrawals/:id/approve', authenticateAdmin, adminController.approveWithdrawal);
router.put('/withdrawals/:id/reject', authenticateAdmin, rejectRequestRules, validate, adminController.rejectWithdrawal);

// 6. Tournament Admin Operations
router.post('/tournaments', authenticateAdmin, upload.single('banner'), createTournamentRules, validate, adminController.createTournament);
router.put('/tournaments/:id', authenticateAdmin, upload.single('banner'), adminController.updateTournament);
router.delete('/tournaments/:id', authenticateAdmin, adminController.deleteTournament);
router.put('/tournaments/:id/status', authenticateAdmin, adminController.updateTournamentStatus);
router.post('/tournaments/:id/room', authenticateAdmin, roomDetailsRules, validate, adminController.setRoomDetails);
router.get('/tournaments/:id/participants', authenticateAdmin, adminController.downloadParticipantsCsv);
router.delete('/tournaments/:id/participants/:userId', authenticateAdmin, adminController.removeParticipant);

// 7. Results & Reward Distribution
router.get('/results', authenticateAdmin, adminController.listResults);
router.put('/results/:id/approve', authenticateAdmin, adminController.approveResult);
router.put('/results/:id/reject', authenticateAdmin, rejectRequestRules, validate, adminController.rejectResult);

// 8. Notifications Broadcasts
router.post('/notifications/broadcast', authenticateAdmin, requireSuperAdmin, adminController.sendBroadcast);
router.post('/notifications/user', authenticateAdmin, adminController.sendToUser);

// 9. PWA / APK releases
router.get('/apk/versions', authenticateAdmin, adminController.listApkVersions);
router.post('/apk/upload', authenticateAdmin, requireSuperAdmin, upload.single('apk'), uploadApkRules, validate, adminController.uploadApk);
router.delete('/apk/:id', authenticateAdmin, requireSuperAdmin, adminController.deleteApkVersion);

// 10. Audit Logs
router.get('/audit-logs', authenticateAdmin, requireSuperAdmin, adminController.listAuditLogs);

// 11. Settings & Merchant UPI
router.get('/settings', authenticateAdmin, adminController.getAllSettings);
router.put('/settings/:key', authenticateAdmin, requireSuperAdmin, updateSettingRules, validate, adminController.updateSetting);
router.post('/settings/qr/upload', authenticateAdmin, requireSuperAdmin, upload.single('qr_code'), adminController.uploadQRCode);

// 12. Support Tickets (Admin Views)
router.get('/tickets', authenticateAdmin, adminController.listTickets);
router.get('/tickets/:id', authenticateAdmin, adminController.getTicketDetail);
router.post('/tickets/:id/reply', authenticateAdmin, adminReplyRules, validate, adminController.addAdminReply);
router.put('/tickets/:id/status', authenticateAdmin, adminController.updateTicketStatus);

module.exports = router;
