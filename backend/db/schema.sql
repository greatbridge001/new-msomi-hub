-- =========================================================
-- MSOMI HUB - Supabase Postgres schema
-- =========================================================
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- or via: supabase db execute -f db/schema.sql
--
-- Big change from the old Neon schema: `users` is gone. Supabase Auth owns
-- signup/login/password reset in its own `auth.users` table, which we don't
-- touch directly. Instead we keep a `profiles` table with one row per
-- auth.users row (same id), holding everything the app actually needs
-- (name, university, course, bio, is_admin, referral_code, etc). A trigger
-- creates that row automatically the moment someone signs up.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------
-- PROFILES  (replaces the old `users` table)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email             VARCHAR(255) NOT NULL,
    name              VARCHAR(150) NOT NULL,
    university        VARCHAR(150),
    course            VARCHAR(150),
    year_of_study     SMALLINT,
    profile_picture   TEXT,
    bio               VARCHAR(280),
    phone             VARCHAR(20),
    is_admin          BOOLEAN NOT NULL DEFAULT FALSE,
    referral_code     VARCHAR(12) UNIQUE,
    referred_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by);

-- Helper used all over RLS policies below: is the current user an admin?
-- SECURITY DEFINER so it can read profiles even under a restrictive policy
-- (avoids infinite recursion if profiles' own policy called this too).
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), FALSE);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Generates a short, unique, uppercase referral code (e.g. "K7F3QZ2R").
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR AS $$
DECLARE
  code VARCHAR(12);
  exists_already BOOLEAN;
BEGIN
  LOOP
    code := UPPER(SUBSTRING(MD5(gen_random_uuid()::TEXT) FROM 1 FOR 8));
    SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = code) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Fires when Supabase Auth creates a new auth.users row (i.e. on signup).
-- Reads the signup metadata your frontend passes in `options.data` and
-- turns it into the matching profile row - this replaces everything
-- authController.register() used to do by hand.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  referrer_id UUID;
  incoming_code TEXT;
BEGIN
  incoming_code := NEW.raw_user_meta_data->>'referral_code_input';
  IF incoming_code IS NOT NULL AND incoming_code <> '' THEN
    SELECT id INTO referrer_id FROM profiles WHERE referral_code = UPPER(incoming_code);
  END IF;

  INSERT INTO profiles (id, email, name, university, course, year_of_study, referral_code, referred_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Student'),
    NEW.raw_user_meta_data->>'university',
    NEW.raw_user_meta_data->>'course',
    NULLIF(NEW.raw_user_meta_data->>'year_of_study', '')::SMALLINT,
    generate_referral_code(),
    referrer_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Keeps profiles.email in sync if a user ever changes their login email.
CREATE OR REPLACE FUNCTION handle_user_email_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_user_email_update();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own_or_admin" ON profiles FOR SELECT
  USING (auth.uid() = id OR is_admin());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- Admins update other profiles (e.g. promoting another admin) via the
-- service-role-backed Express admin endpoints, which bypass RLS entirely,
-- so no separate admin UPDATE policy is needed here.

-- ---------------------------------------------------------
-- SUBSCRIPTIONS  (unchanged shape, FK now -> profiles)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'expired')),
    amount_paid   NUMERIC(10,2),
    activated_at  TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_select_own_or_admin" ON subscriptions FOR SELECT
  USING (auth.uid() = user_id OR is_admin());
-- No client INSERT/UPDATE policy: subscriptions only change via the
-- PayHero webhook, which runs through Express with the service role key.

-- ---------------------------------------------------------
-- PAYMENT TRANSACTIONS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    external_reference  VARCHAR(100) NOT NULL UNIQUE,
    checkout_request_id VARCHAR(150),
    phone_number        VARCHAR(20) NOT NULL,
    amount              NUMERIC(10,2) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    mpesa_receipt_number VARCHAR(50),
    result_desc         TEXT,
    raw_callback        JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_tx_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_checkout ON payment_transactions(checkout_request_id);
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_tx_select_own_or_admin" ON payment_transactions FOR SELECT
  USING (auth.uid() = user_id OR is_admin());
-- Writes only ever happen via Express (service role) - PayHero calls, never the client directly.

-- ---------------------------------------------------------
-- STUDY TIMETABLES
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_timetables (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    subject     VARCHAR(150) NOT NULL,
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    location    VARCHAR(150),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_timetables_user ON study_timetables(user_id);
ALTER TABLE study_timetables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timetables_owner_with_subscription" ON study_timetables FOR ALL
  USING (
    auth.uid() = user_id AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = auth.uid()
          AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW())
      )
    )
  )
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------
-- GPA RECORDS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS gpa_records (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    semester      VARCHAR(50) NOT NULL,
    unit_name     VARCHAR(150) NOT NULL,
    grade         VARCHAR(5) NOT NULL,
    credit_hours  NUMERIC(4,1) NOT NULL,
    grade_points  NUMERIC(4,2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gpa_user ON gpa_records(user_id);
ALTER TABLE gpa_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpa_owner_with_subscription" ON gpa_records FOR ALL
  USING (
    auth.uid() = user_id AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = auth.uid()
          AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW())
      )
    )
  )
  WITH CHECK (auth.uid() = user_id);

-- Standard 4.0 grade scale, mirrors the old computeGradePoints() in gpaRoutes.js.
CREATE OR REPLACE FUNCTION grade_to_points(grade TEXT)
RETURNS NUMERIC AS $$
  SELECT CASE UPPER(grade)
    WHEN 'A' THEN 4.0 WHEN 'A-' THEN 3.7 WHEN 'B+' THEN 3.3 WHEN 'B' THEN 3.0
    WHEN 'B-' THEN 2.7 WHEN 'C+' THEN 2.3 WHEN 'C' THEN 2.0 WHEN 'C-' THEN 1.7
    WHEN 'D' THEN 1.0 WHEN 'E' THEN 0.0 WHEN 'F' THEN 0.0 ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Auto-fills grade_points from grade on insert/update if the client didn't
-- send one, same behaviour as the old Express route.
CREATE OR REPLACE FUNCTION set_gpa_points()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.grade_points IS NULL THEN
    NEW.grade_points := grade_to_points(NEW.grade);
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_gpa_points ON gpa_records;
CREATE TRIGGER trg_set_gpa_points BEFORE INSERT OR UPDATE ON gpa_records
  FOR EACH ROW EXECUTE FUNCTION set_gpa_points();

-- Replaces GET /api/gpa/summary/all - call from the frontend with
-- supabase.rpc('gpa_summary'). RLS on gpa_records still applies underneath.
CREATE OR REPLACE FUNCTION gpa_summary()
RETURNS TABLE(semester TEXT, gpa NUMERIC) AS $$
  SELECT semester,
         ROUND(SUM(grade_points * credit_hours) / NULLIF(SUM(credit_hours), 0), 2) AS gpa
  FROM gpa_records
  WHERE user_id = auth.uid()
  GROUP BY semester;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION cumulative_gpa()
RETURNS NUMERIC AS $$
  SELECT ROUND(SUM(grade_points * credit_hours) / NULLIF(SUM(credit_hours), 0), 2)
  FROM gpa_records WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------
-- BUDGET RECORDS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    entry_type  VARCHAR(10) NOT NULL CHECK (entry_type IN ('income', 'expense')),
    category    VARCHAR(100) NOT NULL,
    amount      NUMERIC(12,2) NOT NULL,
    description TEXT,
    record_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_user ON budget_records(user_id);
ALTER TABLE budget_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_owner_with_subscription" ON budget_records FOR ALL
  USING (
    auth.uid() = user_id AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = auth.uid()
          AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW())
      )
    )
  )
  WITH CHECK (auth.uid() = user_id);

-- Replaces GET /api/budget/summary/month?month=YYYY-MM
CREATE OR REPLACE FUNCTION budget_summary(p_month TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'YYYY-MM'))
RETURNS JSON AS $$
  SELECT json_build_object(
    'month', p_month,
    'income', COALESCE(SUM(amount) FILTER (WHERE entry_type = 'income'), 0),
    'expenses', COALESCE(SUM(amount) FILTER (WHERE entry_type = 'expense'), 0),
    'balance', COALESCE(SUM(amount) FILTER (WHERE entry_type = 'income'), 0)
             - COALESCE(SUM(amount) FILTER (WHERE entry_type = 'expense'), 0),
    'byCategory', COALESCE(
      (SELECT json_object_agg(category, cat_total) FROM (
        SELECT category, SUM(amount) AS cat_total FROM budget_records
        WHERE user_id = auth.uid() AND to_char(record_date, 'YYYY-MM') = p_month
        GROUP BY category
      ) c), '{}'::json)
  )
  FROM budget_records
  WHERE user_id = auth.uid() AND to_char(record_date, 'YYYY-MM') = p_month;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------
-- ANNOUNCEMENTS / HELB UPDATES / OPPORTUNITIES (admin-managed, public read)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(255) NOT NULL,
    content     TEXT NOT NULL,
    category    VARCHAR(100) DEFAULT 'general',
    created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements_read_all" ON announcements FOR SELECT USING (true);
CREATE POLICY "announcements_admin_write" ON announcements FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "announcements_admin_update" ON announcements FOR UPDATE USING (is_admin());
CREATE POLICY "announcements_admin_delete" ON announcements FOR DELETE USING (is_admin());

CREATE TABLE IF NOT EXISTS helb_updates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(255) NOT NULL,
    content     TEXT NOT NULL,
    update_type VARCHAR(20) NOT NULL DEFAULT 'helb' CHECK (update_type IN ('helb', 'scholarship', 'bursary')),
    created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE helb_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "helb_read_all" ON helb_updates FOR SELECT USING (true);
CREATE POLICY "helb_admin_write" ON helb_updates FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "helb_admin_update" ON helb_updates FOR UPDATE USING (is_admin());
CREATE POLICY "helb_admin_delete" ON helb_updates FOR DELETE USING (is_admin());

CREATE TABLE IF NOT EXISTS opportunities (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title          VARCHAR(255) NOT NULL,
    description    TEXT NOT NULL,
    opportunity_type VARCHAR(30) NOT NULL CHECK (
        opportunity_type IN ('internship', 'attachment', 'graduate_trainee', 'online_job', 'competition')
    ),
    organization   VARCHAR(150),
    link           TEXT,
    deadline       DATE,
    created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON opportunities(opportunity_type);
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunities_read_all" ON opportunities FOR SELECT USING (true);
CREATE POLICY "opportunities_admin_write" ON opportunities FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "opportunities_admin_update" ON opportunities FOR UPDATE USING (is_admin());
CREATE POLICY "opportunities_admin_delete" ON opportunities FOR DELETE USING (is_admin());

-- ---------------------------------------------------------
-- BIBLE VERSES / MOTIVATIONAL QUOTES (admin-managed, logged-in read)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS bible_verses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verse_text    TEXT NOT NULL,
    reference     VARCHAR(100) NOT NULL,
    date_assigned DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bible_verses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verses_read_authenticated" ON bible_verses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "verses_admin_write" ON bible_verses FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "verses_admin_update" ON bible_verses FOR UPDATE USING (is_admin());
CREATE POLICY "verses_admin_delete" ON bible_verses FOR DELETE USING (is_admin());

CREATE TABLE IF NOT EXISTS motivational_quotes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_text    TEXT NOT NULL,
    author        VARCHAR(150),
    date_assigned DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE motivational_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_read_authenticated" ON motivational_quotes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "quotes_admin_write" ON motivational_quotes FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "quotes_admin_update" ON motivational_quotes FOR UPDATE USING (is_admin());
CREATE POLICY "quotes_admin_delete" ON motivational_quotes FOR DELETE USING (is_admin());

INSERT INTO bible_verses (verse_text, reference, date_assigned)
VALUES ('I can do all things through Christ who strengthens me.', 'Philippians 4:13', CURRENT_DATE)
ON CONFLICT DO NOTHING;

INSERT INTO motivational_quotes (quote_text, author, date_assigned)
VALUES ('Success is the sum of small efforts repeated day in and day out.', 'Robert Collier', CURRENT_DATE)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------
-- CAT / ASSIGNMENT REMINDERS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_reminders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    subject     VARCHAR(150),
    reminder_type VARCHAR(20) NOT NULL DEFAULT 'cat' CHECK (reminder_type IN ('cat', 'assignment', 'exam', 'other')),
    due_date    TIMESTAMPTZ NOT NULL,
    completed   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON cat_reminders(user_id);
ALTER TABLE cat_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reminders_owner_with_subscription" ON cat_reminders FOR ALL
  USING (
    auth.uid() = user_id AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = auth.uid()
          AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW())
      )
    )
  )
  WITH CHECK (auth.uid() = user_id);
-- Express's reminderScheduler.js reads this table directly over a plain
-- Postgres connection (not through PostgREST), so it is unaffected by RLS.

-- ---------------------------------------------------------
-- BOOKMARKS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookmarks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    item_type   VARCHAR(30) NOT NULL CHECK (item_type IN ('announcement', 'helb_update', 'opportunity')),
    item_id     UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookmarks_owner_with_subscription" ON bookmarks FOR ALL
  USING (
    auth.uid() = user_id AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = auth.uid()
          AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW())
      )
    )
  )
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------
-- COFFEE TIPS ("Buy Me a Coffee") - anonymous, Express-only
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS coffee_tips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supporter_name      VARCHAR(150),
    phone_number        VARCHAR(20) NOT NULL,
    amount              NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    external_reference  VARCHAR(100) NOT NULL UNIQUE,
    checkout_request_id VARCHAR(150),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    mpesa_receipt_number VARCHAR(50),
    result_desc         TEXT,
    raw_callback        JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coffee_tips_checkout ON coffee_tips(checkout_request_id);
-- No RLS needed: this table is only ever touched by Express via the
-- Supabase connection string (a trusted server role), never by the client.

-- ---------------------------------------------------------
-- PAST PAPERS / REVISION MATERIALS
-- file_paths now holds Supabase Storage object paths (bucket
-- "revision-papers"), not Cloudinary URLs - one entry per uploaded
-- page/file, in order. file_type records whether that path is a
-- scanned image or a native PDF (a paper can mix both).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS past_papers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school         VARCHAR(150) NOT NULL,
    course         VARCHAR(150) NOT NULL,
    unit           VARCHAR(150),
    paper_type     VARCHAR(10) NOT NULL CHECK (paper_type IN ('cat', 'exam')),
    academic_year  VARCHAR(20) NOT NULL,
    file_paths     JSONB NOT NULL,   -- [{ "path": "school/course/xyz.pdf", "type": "pdf" }, ...]
    uploaded_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_past_papers_search ON past_papers(school, course, paper_type, academic_year);
-- Metadata stays Express-gated (via requirePastPaperAccess), same as before,
-- so no client-facing RLS policy is defined here on purpose.

CREATE TABLE IF NOT EXISTS past_paper_access (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'expired')),
    amount_paid   NUMERIC(10,2),
    activated_at  TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_past_paper_access_user ON past_paper_access(user_id);

CREATE TABLE IF NOT EXISTS past_paper_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    external_reference  VARCHAR(100) NOT NULL UNIQUE,
    checkout_request_id VARCHAR(150),
    phone_number        VARCHAR(20) NOT NULL,
    amount              NUMERIC(10,2) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    mpesa_receipt_number VARCHAR(50),
    result_desc         TEXT,
    raw_callback        JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_past_paper_tx_user ON past_paper_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_past_paper_tx_checkout ON past_paper_transactions(checkout_request_id);

-- ---------------------------------------------------------
-- REMINDER PREFERENCES
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminder_preferences (
    user_id               UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    sms_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
    email_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    class_reminder_60min  BOOLEAN NOT NULL DEFAULT TRUE,
    class_reminder_30min  BOOLEAN NOT NULL DEFAULT TRUE,
    cat_interval_days     SMALLINT NOT NULL DEFAULT 4 CHECK (cat_interval_days BETWEEN 1 AND 4),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE reminder_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reminder_prefs_owner" ON reminder_preferences FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enforces the old app-layer rule: can't turn on SMS reminders without a
-- phone number on file. Now lives in the database since the client writes
-- to this table directly.
CREATE OR REPLACE FUNCTION check_sms_requires_phone()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sms_enabled = TRUE THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND phone IS NOT NULL AND phone <> '') THEN
      RAISE EXCEPTION 'Add a phone number to your profile before enabling SMS reminders';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_sms_phone ON reminder_preferences;
CREATE TRIGGER trg_check_sms_phone BEFORE INSERT OR UPDATE ON reminder_preferences
  FOR EACH ROW EXECUTE FUNCTION check_sms_requires_phone();

-- ---------------------------------------------------------
-- NOTIFICATION LOG (Express/cron only, no RLS needed)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reference_type  VARCHAR(20) NOT NULL CHECK (reference_type IN ('class', 'cat_reminder')),
    reference_id    UUID NOT NULL,
    notify_kind     VARCHAR(20) NOT NULL,
    dedupe_key      VARCHAR(40) NOT NULL,
    channel         VARCHAR(10) NOT NULL CHECK (channel IN ('sms', 'email')),
    status          VARCHAR(10) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (reference_type, reference_id, notify_kind, dedupe_key, channel)
);

-- ---------------------------------------------------------
-- STORAGE: revision-papers bucket policies
-- The bucket itself can't be created by SQL - create it once via the
-- Supabase dashboard (Storage -> New bucket -> "revision-papers", Private)
-- or the setup script in backend/scripts/setupStorage.js. These policies
-- are a defense-in-depth layer: Express issues signed URLs using the
-- service role (which bypasses RLS), so normal app usage never depends on
-- these, but they stop the anon/public key from ever reading a paper
-- directly if it were somehow exposed.
-- ---------------------------------------------------------
CREATE POLICY "revision_papers_paid_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'revision-papers' AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM past_paper_access a WHERE a.user_id = auth.uid()
          AND a.status = 'active' AND (a.expires_at IS NULL OR a.expires_at > NOW())
      )
    )
  );
CREATE POLICY "revision_papers_admin_write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'revision-papers' AND is_admin());
CREATE POLICY "revision_papers_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'revision-papers' AND is_admin());
