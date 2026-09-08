# Msomi Hub — Student Success Portal (Supabase edition)

The daily companion for Kenyan university students: timetable, GPA, budget,
CAT/exam reminders, HELB & funding updates, opportunities, saved items,
revision papers (PDF + photo), and a student toolkit — all in one place.
Free to register; KES 100 unlocks every feature for a full academic year
(admins get free full access automatically).

## Stack (hybrid Supabase + Express)

- **Frontend:** Vanilla HTML/CSS/JS (ES modules), no build step. Calls
  **Supabase directly** (Postgres + Auth, via `supabase-js`) for everything
  that's just "read/write my own data" - timetable, GPA, budget, bookmarks,
  reminders, HELB/opportunities/announcements, dashboard. Row Level
  Security in `backend/db/schema.sql` enforces who can see/change what.
- **Backend (Express):** trimmed down to only what genuinely needs a
  trusted server: PayHero M-Pesa payments, coffee tips, admin actions, and
  past-paper Storage uploads/signed URLs. Deploy this anywhere that
  doesn't sleep on idle (Railway/Fly.io, NOT Render's free web-service
  tier) - see `DEPLOYMENT.md`.
- **Database + Auth + Storage:** Supabase. `backend/db/schema.sql` is the
  full schema, including Row Level Security policies and a private
  `revision-papers` Storage bucket for past papers.

## Project structure

```
backend/
  db/
    schema.sql        - full Supabase Postgres schema + RLS policies
    migrate.js         - runs schema.sql against DATABASE_URL
    seed.js             - seeds sample admin-managed content
  scripts/
    setupStorage.js     - creates the private "revision-papers" bucket
  src/
    app.js              - Express app: payments, coffee, admin, pastpapers, cron only
    config/
      db.js              - pg pool (Supabase connection string)
      supabaseAdmin.js   - supabase-js client using the service role key
    controllers/         - paymentController, coffeecontroller, adminController,
                            pastPaperController, pastPaperPaymentController
    middleware/
      auth.js            - verifies Supabase-issued JWTs
      subscription.js    - active-subscription gate for kept routes
      pastPaperAccess.js - past-paper paywall gate
    routes/               - paymentRoutes, coffeeRoutes, adminRoutes,
                             pastPaperRoutes, cronRoutes
    jobs/reminderScheduler.js - class/CAT/exam reminder cron logic
    services/            - payheroService, notificationService, emailService, smsService

frontend/
  js/
    supabaseClient.js   - Supabase project URL + anon key (fill these in)
    api.js               - routes calls to Supabase or Express (see DEPLOYMENT.md)
    auth.js, profile.js, timetable.js, gpa.js, budget.js, bookmarks.js,
    reminders.js, helb.js, opportunities.js, announcements.js,
    dashboard.js, admin.js, pastpapers.js, ...  - UNCHANGED page logic;
    they all still call the same `api.get/post/put/patch/del` shape
  pages/                 - one HTML page per feature
```

See **DEPLOYMENT.md** for the full step-by-step setup and deploy guide,
and `backend/README-cron.md` for the reminder-scheduling options.

## Security note

Rotate `DATABASE_URL`, `JWT_SECRET`, PayHero credentials, the Africa's
Talking key, and the SMTP password from the old project - a `.env` and a
`.env.example` with real values were found in the original upload. See
DEPLOYMENT.md's first section for what to rotate before going live.
