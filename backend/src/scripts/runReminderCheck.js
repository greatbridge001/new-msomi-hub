require('dotenv').config();
const { checkClassReminders, checkCatReminders } = require('../jobs/reminderScheduler');

// One-off entry point for `npm run reminders:check` - lets an external
// free scheduler (GitHub Actions, cron-job.org) run a single check pass
// without keeping a Node process alive. Prefer the HTTP route in
// cronRoutes.js (/api/cron/check-reminders) if your host is already
// running the Express server anyway - this script is for triggering it as
// a standalone process instead (e.g. a scheduled GitHub Actions job).
(async () => {
  try {
    await checkClassReminders();
    await checkCatReminders();
    console.log('[runReminderCheck] done');
    process.exit(0);
  } catch (err) {
    console.error('[runReminderCheck] failed:', err);
    process.exit(1);
  }
})();
