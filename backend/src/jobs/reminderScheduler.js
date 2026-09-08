const cron = require('node-cron');
const { query } = require('../config/db');
const { getUserWithPreferences, sendReminder } = require('../services/notificationService');
const { getNairobiParts, timeStrToMinutes } = require('../utils/nairobiTime');

/**
 * Fires the "1 hour before" and "30 minutes before" class reminders. Runs
 * every tick (every 5 min) since these are time-sensitive to the minute.
 */
async function checkClassReminders() {
  const { dateStr, dayOfWeek, minutesSinceMidnight } = getNairobiParts();

  const result = await query(
    `SELECT id, user_id, subject, start_time, location
     FROM study_timetables
     WHERE day_of_week = $1`,
    [dayOfWeek]
  );

  for (const cls of result.rows) {
    const minutesUntil = timeStrToMinutes(cls.start_time) - minutesSinceMidnight;

    // Windows are wider than the exact target (±4 min) so a slow tick or a
    // start time that isn't a clean multiple of 5 still gets caught -
    // notification_log's unique constraint guarantees only one send either way.
    let notifyKind = null;
    if (minutesUntil >= 56 && minutesUntil <= 64) notifyKind = '60min';
    else if (minutesUntil >= 26 && minutesUntil <= 34) notifyKind = '30min';
    if (!notifyKind) continue;

    const user = await getUserWithPreferences(cls.user_id);
    if (!user) continue;
    if (notifyKind === '60min' && !user.class_reminder_60min) continue;
    if (notifyKind === '30min' && !user.class_reminder_30min) continue;

    const when = notifyKind === '60min' ? '1 hour' : '30 minutes';
    const where = cls.location ? ` at ${cls.location}` : '';
    const text = `Msomi Hub: ${cls.subject} starts in ${when}${where}.`;

    await sendReminder({
      user,
      referenceType: 'class',
      referenceId: cls.id,
      notifyKind,
      dedupeKey: dateStr, // one send per class per calendar day
      smsText: text,
      emailSubject: `Class reminder: ${cls.subject} in ${when}`,
      emailBody: `Hi ${user.name},\n\n${text}\n\n- Msomi Hub`
    });
  }
}

/**
 * Fires CAT/exam/assignment reminders: a mandatory "due tomorrow" alert,
 * plus a recurring "every N days" nudge on the interval the student chose
 * (capped at 4 days). Only evaluated once a day, in the early morning, so
 * students get one predictable nudge rather than one every 5 minutes.
 */
async function checkCatReminders() {
  const { dateStr, hour } = getNairobiParts();
  if (hour !== 7) return;

  const result = await query(
    `SELECT id, user_id, title, subject, reminder_type, due_date
     FROM cat_reminders
     WHERE completed = FALSE AND due_date > NOW()`
  );

  for (const cat of result.rows) {
    const user = await getUserWithPreferences(cat.user_id);
    if (!user) continue;

    const msUntilDue = new Date(cat.due_date).getTime() - Date.now();
    const daysUntilDue = Math.ceil(msUntilDue / 86400000);
    const label = cat.reminder_type === 'exam' ? 'Exam' : cat.reminder_type === 'assignment' ? 'Assignment' : 'CAT';
    const subjectPart = cat.subject ? ` (${cat.subject})` : '';

    if (daysUntilDue <= 1) {
      // Mandatory - always sent regardless of the student's interval setting.
      const text = `Msomi Hub: ${label} "${cat.title}"${subjectPart} is due tomorrow.`;
      await sendReminder({
        user,
        referenceType: 'cat_reminder',
        referenceId: cat.id,
        notifyKind: 'day_before',
        dedupeKey: dateStr,
        smsText: text,
        emailSubject: `Due tomorrow: ${cat.title}`,
        emailBody: `Hi ${user.name},\n\n${text}\n\n- Msomi Hub`
      });
      continue;
    }

    if (daysUntilDue % user.cat_interval_days === 0) {
      const text = `Msomi Hub: ${label} "${cat.title}"${subjectPart} due in ${daysUntilDue} days.`;
      await sendReminder({
        user,
        referenceType: 'cat_reminder',
        referenceId: cat.id,
        notifyKind: 'interval',
        dedupeKey: dateStr,
        smsText: text,
        emailSubject: `Upcoming: ${cat.title} in ${daysUntilDue} days`,
        emailBody: `Hi ${user.name},\n\n${text}\n\n- Msomi Hub`
      });
    }
  }
}

function startReminderScheduler() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkClassReminders();
      await checkCatReminders();
    } catch (err) {
      console.error('[reminderScheduler] tick failed:', err);
    }
  });
  console.log('[reminderScheduler] started - checking every 5 minutes');
}

module.exports = { startReminderScheduler, checkClassReminders, checkCatReminders };
