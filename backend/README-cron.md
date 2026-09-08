# Reminder Cron Job

Class/CAT/exam reminders need something to poke the server every 5
minutes. Two ways to do it, pick whichever is easier on your new host:

## Option A - free external pinger hitting the HTTP route (recommended)

`GET/POST /api/cron/check-reminders?secret=YOUR_CRON_SECRET` (see
`src/routes/cronRoutes.js`) runs one reminder-check pass. Point a free
external scheduler at it every 5 minutes:

- **cron-job.org** (free, no account limits that matter here) - add a job
  hitting `https://your-api-host/api/cron/check-reminders?secret=...`
  every 5 minutes.
- **GitHub Actions** scheduled workflow - a `schedule: cron: '*/5 * * * *'`
  step running `curl` against the same URL. Free on public repos, counts
  against Actions minutes on private ones.
- **UptimeRobot** - a monitor hitting the URL every 5 minutes also works,
  and doubles as basic uptime monitoring for the whole API.

Set `CRON_SECRET` in your host's environment variables to something long
and random so randoms on the internet can't trigger it (or run up your SMS
bill). Leave `ENABLE_INTERNAL_SCHEDULER` unset/false in this setup.

## Option B - your host's own scheduled job feature

If your host (Railway, Fly.io, etc.) has a native cron/scheduled-task
feature, point it at `node src/scripts/runReminderCheck.js` every 5
minutes instead, with the same environment variables as the main service
(`DATABASE_URL`, `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).

## Local development

```
npm run reminders:check
```

Runs one pass and exits - same script Option B runs on a schedule.
