const express = require('express');
const { checkClassReminders, checkCatReminders } = require('../jobs/reminderScheduler');

const router = express.Router();

/**
 * POST/GET /api/cron/check-reminders?secret=...
 *
 * Lets a free external scheduler (cron-job.org, GitHub Actions, UptimeRobot,
 * etc.) trigger a reminder-check pass by hitting this URL every ~5 minutes -
 * no paid Render plan or separate Cron Job service required. The secret
 * check stops randoms on the internet from spamming your students with
 * reminders or running up your SMS bill.
 */
async function handleCronCheck(req, res) {
  const providedSecret = req.query.secret || req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Invalid or missing cron secret' });
  }

  try {
    await checkClassReminders();
    await checkCatReminders();
    res.json({ ok: true, checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[cron] reminder check failed:', err);
    res.status(500).json({ ok: false, error: 'Reminder check failed' });
  }
}

router.get('/check-reminders', handleCronCheck);
router.post('/check-reminders', handleCronCheck);

module.exports = router;