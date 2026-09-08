# Deployment Guide - Msomi Hub (Supabase edition)

Follow these in order. Each step says exactly what to click/run.

## 0. Rotate old secrets first (don't skip this)

The original project zip contained a real `.env` (with live `DATABASE_URL`,
`JWT_SECRET`, PayHero credentials, Africa's Talking key, SMTP password) and
a `.env.example` with what looked like a real Neon connection string too.
Before anything else:

- Log into Neon and rotate/regenerate that database's password (or just
  abandon that database entirely, since you're moving to Supabase anyway).
- Log into PayHero and rotate the API username/password if you're not
  changing them as part of this move.
- Regenerate your Africa's Talking API key.
- Regenerate the Gmail App Password used for SMTP.

None of these get reused anywhere in the new setup below - every `.env`
file in this rebuild uses placeholders only.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Pick a region close to your users (e.g. `eu-central-1` or a region near
   Kenya if offered) and set a strong database password - save it, you'll
   need it for `DATABASE_URL`.
3. Wait for provisioning (~2 min).

## 2. Run the schema

1. In the Supabase Dashboard: **SQL Editor** → **New query**.
2. Paste the entire contents of `backend/db/schema.sql` and click **Run**.
3. Confirm no errors. You should now see `profiles`, `subscriptions`,
   `study_timetables`, `gpa_records`, `budget_records`, `announcements`,
   `helb_updates`, `opportunities`, `bible_verses`,
   `motivational_quotes`, `cat_reminders`, `bookmarks`, `coffee_tips`,
   `past_papers`, `past_paper_access`, `past_paper_transactions`,
   `reminder_preferences`, `notification_log` under **Table Editor**.

## 3. Create the Storage bucket

Either:

- **Dashboard:** Storage → New bucket → name `revision-papers` → toggle
  **Private** (not public) → Create.
- **Or via script**, from `backend/`:
  ```
  cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first
  npm install
  npm run setup:storage
  ```

## 4. Collect your Supabase keys

Dashboard → **Project Settings** → **API**:
- `Project URL` → this is `SUPABASE_URL`
- `anon` `public` key → this is your frontend's `SUPABASE_ANON_KEY`
- `service_role` key → this is `SUPABASE_SERVICE_ROLE_KEY` (backend only,
  **never** put this in frontend code)

Dashboard → **Project Settings** → **API** → **JWT Settings**:
- `JWT Secret` → this is `SUPABASE_JWT_SECRET`

Dashboard → **Project Settings** → **Database** → **Connection string** →
**Transaction** mode:
- This is your `DATABASE_URL` (fill in the password you set in step 1)

## 5. Configure the frontend

Edit `frontend/js/supabaseClient.js`:

```js
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-public-key';
```

Edit `frontend/js/api.js`, near the top:

```js
const EXPRESS_API_BASE_URL = 'https://your-api-host.example.com/api';
```

(You'll fill in the real API host after step 7. It's fine to leave a
placeholder for now and come back.)

## 6. Seed starter content (optional but recommended)

From `backend/`, with `.env` filled in (step 3):

```
npm run db:seed
```

This adds sample announcements, HELB updates, opportunities, and a
rotating 100-day cycle of verses/quotes so the app isn't empty on first
login. Safe to skip - the admin panel can add all of this manually too.

## 7. Deploy the Express backend (NOT Render's free tier)

Pick **Railway** or **Fly.io** - either has a tier that doesn't sleep on
idle the way Render's free web service does, which was your original
"slow loading / sleeping" complaint.

### Railway (simplest)

1. New Project → Deploy from GitHub repo → select this repo, root
   directory `backend`.
2. Build command: `npm install`. Start command: `npm start`.
3. Variables tab → add everything from `backend/.env.example`, filled in:
   `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_JWT_SECRET`, `CORS_ORIGINS` (your frontend's deployed URL),
   `PAYHERO_*`, `SUBSCRIPTION_PRICE`, `SUBSCRIPTION_VALIDITY_DAYS`,
   `AT_*`, `SMTP_*`, `CRON_SECRET` (make up a long random string).
4. Deploy. Railway gives you a public URL like
   `https://msomi-hub-backend-production.up.railway.app`.
5. Go back to `frontend/js/api.js` and set `EXPRESS_API_BASE_URL` to
   `https://<that-url>/api`.
6. Update `PAYHERO_CALLBACK_URL` and `PAYHERO_COFFEE_CALLBACK_URL` in
   Railway's variables to point at that same host
   (`https://<that-url>/api/payments/callback` and `/api/coffee/callback`).

### Fly.io (alternative)

`fly launch` from `backend/`, follow the prompts (it'll detect Node),
then `fly secrets set KEY=value` for each variable above, then `fly deploy`.

## 8. Set up the reminder cron

See `backend/README-cron.md`. Fastest option: a free account at
[cron-job.org](https://cron-job.org), one job hitting
`https://<your-api-host>/api/cron/check-reminders?secret=<CRON_SECRET>`
every 5 minutes.

## 9. Deploy the frontend

The frontend is static files - any static host works (Vercel, Netlify,
Cloudflare Pages, GitHub Pages). Point it at the `frontend/` directory.

Example with Vercel: `vercel --cwd frontend` (or connect the repo in the
Vercel dashboard with root directory `frontend`).

Once deployed, go back to Railway/Fly and update `CORS_ORIGINS` to include
that frontend URL, and redeploy the backend so CORS allows it.

## 10. Test the whole flow

1. Register a new account → confirm a row appears in `profiles` (Supabase
   Table Editor) with a generated `referral_code`.
2. Log in, check the dashboard loads (verse/quote/timetable/etc, even if
   empty).
3. Add a timetable class, GPA unit, budget entry, reminder - confirm they
   save and reload correctly.
4. Promote yourself to admin: in Supabase Table Editor, open your row in
   `profiles`, set `is_admin` to `true`.
5. Log out and back in (refreshes the cached admin flag), open the Admin
   Panel, add an announcement/HELB update/opportunity - confirm it shows
   up for a normal (non-admin) account.
6. Admin panel → Past Papers → upload a PDF and a photo for the same
   entry → as a subscribed student, open Revision Materials → confirm you
   can view and download both.
7. Test the M-Pesa flow with PayHero's sandbox credentials before going
   live with real payments.

## Known simplifications in this pass

- The dashboard's "today" now uses the browser's local clock instead of
  the old server-side Africa/Nairobi timezone calculation. Fine for users
  actually in Kenya; worth revisiting if you expect Kenyan students using
  a device set to a different timezone.
- Editing a past paper's files replaces the entire file set (no
  per-file removal in the admin UI) - uploading nothing keeps the
  existing files as-is.
- Profile pictures are still stored as a compressed base64 string in
  `profiles.profile_picture` rather than moved to Storage - fine at
  current scale, but worth moving to Storage later if profile rows start
  feeling large.
