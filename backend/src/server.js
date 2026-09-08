require('dotenv').config();
const app = require('./app');
const { startReminderScheduler } = require('./jobs/reminderScheduler');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`StudentFlow Kenya API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

// Only start the in-process scheduler if explicitly enabled (e.g. local dev
// without a separate Render Cron Job set up). In production, the reminder
// check runs as its own Render Cron Job service instead - see
// src/scripts/runReminderCheck.js - so the web service doesn't need to
// (and, on the free plan, can't reliably) run it in the background.
if (process.env.ENABLE_INTERNAL_SCHEDULER === 'true') {
  startReminderScheduler();
}
