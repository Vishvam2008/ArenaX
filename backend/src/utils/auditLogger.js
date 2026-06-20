/**
 * auditLogger.js — System Audit Logging Helper
 * Inserts actions into the audit_logs table.
 * Swallows database errors so failures in logging do not crash request handlers.
 */

'use strict';

const db = require('../config/db');

/**
 * Logs an event to the audit_logs table.
 * @param {object} params
 * @param {'user'|'admin'|'system'} params.actorType - Type of actor performing the action
 * @param {string} [params.actorId] - UUID of the actor (if applicable)
 * @param {string} params.action - Description of the action performed
 * @param {string} [params.entityType] - Type of entity affected (e.g. 'user', 'wallet')
 * @param {string} [params.entityId] - UUID of the entity affected
 * @param {object} [params.payload] - Additional JSON payload detail
 * @param {import('express').Request} [params.req] - Express request object for IP & User Agent extraction
 */
async function logAudit({ actorType, actorId = null, action, entityType = null, entityId = null, payload = null, req = null }) {
  try {
    let ipAddress = null;
    let userAgent = null;

    if (req) {
      ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
      userAgent = req.headers['user-agent'] || null;
    }

    const sql = `
      INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, payload, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await db.query(sql, [
      actorType,
      actorId,
      action,
      entityType,
      entityId,
      payload ? JSON.stringify(payload) : null,
      ipAddress,
      userAgent,
    ]);
  } catch (err) {
    // Audit logs should fail silently and not interrupt main code flow, but we can log for local debug
    console.error('⚠️ Audit logging failed:', err.message);
  }
}

module.exports = {
  logAudit,
};
