/**
 * notification.js — Central Notification Dispatcher
 * Dispatches notifications across multiple active channels (PWA notifications,
 * and future SMS/WhatsApp integrations).
 */

'use strict';

const inAppChannel = require('./channels/inApp');

// Active notification channels
const channels = [
  inAppChannel, // In-App notification storage (always active)
  // require('./channels/sms'),       // Future SMS channel
  // require('./channels/whatsapp'),  // Future WhatsApp channel
];

/**
 * Dispatches a notification across all active channels.
 * @param {object} params
 * @param {string|null} params.userId - Target user UUID (null for system-wide broadcast)
 * @param {string} params.title - Notification title
 * @param {string} params.body - Detailed text content
 * @param {'tournament'|'payment'|'withdrawal'|'reward'|'system'|'ticket'} params.type - Category of notification
 * @param {string} [params.referenceId=null] - UUID of referencing record (e.g. tournamentId, paymentRequestId)
 * @param {string} [params.referenceType=null] - Type string of reference
 * @returns {Promise<void>}
 */
async function createNotification({ userId, title, body, type, referenceId = null, referenceType = null }) {
  const deliveryPromises = channels.map((channel) => {
    return channel.send({ userId, title, body, type, referenceId, referenceType })
      .catch((err) => {
        // Log individual channel failures but do not block other channels
        console.error(`⚠️ Notification delivery failed on a channel:`, err.message);
      });
  });

  await Promise.all(deliveryPromises);
}

module.exports = {
  createNotification,
};
