const { query } = require('../config/db');
const { sendSms } = require('./smsService');
const { sendEmail } = require('./emailService');

/**
 * Fetches (or lazily creates) a user's reminder preferences row, along with
 * the contact details the scheduler needs. One query per user per tick.
 */
async function getUserWithPreferences(userId) {
  const result = await query(
    `SELECT u.id, u.name, u.email, u.phone,
            COALESCE(rp.sms_enabled, FALSE)          AS sms_enabled,
            COALESCE(rp.email_enabled, TRUE)         AS email_enabled,
            COALESCE(rp.class_reminder_60min, TRUE)  AS class_reminder_60min,
            COALESCE(rp.class_reminder_30min, TRUE)  AS class_reminder_30min,
            COALESCE(rp.cat_interval_days, 4)        AS cat_interval_days
     FROM profiles u
     LEFT JOIN reminder_preferences rp ON rp.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Reserves a (reference, notify_kind, dedupe_key, channel) slot in
 * notification_log. Returns true if this call won the reservation (i.e. no
 * one has sent this exact reminder yet), false if it was already sent -
 * this is what stops a class or CAT reminder going out twice if the
 * scheduler's tick overlaps its own send window.
 */
async function reserveSlot({ userId, referenceType, referenceId, notifyKind, dedupeKey, channel }) {
  const result = await query(
    `INSERT INTO notification_log (user_id, reference_type, reference_id, notify_kind, dedupe_key, channel, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'sent')
     ON CONFLICT (reference_type, reference_id, notify_kind, dedupe_key, channel) DO NOTHING
     RETURNING id`,
    [userId, referenceType, referenceId, notifyKind, dedupeKey, channel]
  );
  return result.rows[0]?.id || null;
}

async function markFailed(logId) {
  await query(`UPDATE notification_log SET status = 'failed' WHERE id = $1`, [logId]);
}

/**
 * Sends a reminder to a user on every channel they've enabled and that
 * they've given us contact details for, skipping (without erroring) any
 * combination that's already been sent for this exact slot.
 *
 * @param {Object} params
 * @param {Object} params.user - row from getUserWithPreferences
 * @param {'class'|'cat_reminder'} params.referenceType
 * @param {string} params.referenceId - UUID of the timetable/cat row
 * @param {string} params.notifyKind - '60min' | '30min' | 'interval' | 'day_before'
 * @param {string} params.dedupeKey - e.g. a date string or interval bucket number
 * @param {string} params.smsText - message body for SMS (keep under ~150 chars)
 * @param {string} params.emailSubject
 * @param {string} params.emailBody
 */
async function sendReminder({ user, referenceType, referenceId, notifyKind, dedupeKey, smsText, emailSubject, emailBody }) {
  const results = { sms: null, email: null };

  if (user.sms_enabled && user.phone) {
    const logId = await reserveSlot({
      userId: user.id, referenceType, referenceId, notifyKind, dedupeKey, channel: 'sms'
    });
    if (logId) {
      const outcome = await sendSms(user.phone, smsText);
      if (!outcome.ok) await markFailed(logId);
      results.sms = outcome;
    }
  }

  if (user.email_enabled && user.email) {
    const logId = await reserveSlot({
      userId: user.id, referenceType, referenceId, notifyKind, dedupeKey, channel: 'email'
    });
    if (logId) {
      const outcome = await sendEmail(user.email, emailSubject, emailBody);
      if (!outcome.ok) await markFailed(logId);
      results.email = outcome;
    }
  }

  return results;
}

module.exports = { getUserWithPreferences, sendReminder };
