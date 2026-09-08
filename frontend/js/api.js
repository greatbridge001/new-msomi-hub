// Central API client for Msomi Hub.
//
// Big change from before: most calls now go straight to Supabase
// (Postgres + Auth), protected by Row Level Security, instead of our own
// Express server. Only payments, coffee tips, admin actions, and past
// paper storage/access still hit Express - see EXPRESS_PREFIXES below.
// Every other page in this app (timetable.js, gpa.js, budget.js,
// bookmarks.js, reminders.js, helb.js, opportunities.js, announcements.js,
// dashboard.js, admin.js's content tabs) is UNCHANGED - this file keeps
// the exact same api.get/post/put/patch/del/postForm/putForm contract they
// already call, just re-routes it under the hood.
import { supabase } from './supabaseClient.js';
const EXPRESS_API_BASE_URL = 'https://merry-warmth-production-9029.up.railway.app/api';
const EXPRESS_PREFIXES = ['/payments', '/coffee', '/admin/stats', '/admin/users', '/admin/transactions', '/admin/referral-leaderboard', '/pastpapers'];

const TOKEN_KEY = 'studentflow_token';
const USER_KEY = 'studentflow_user';

function isExpressPath(path) {
  return EXPRESS_PREFIXES.some((p) => path.startsWith(p));
}

/* ============================================================
 * Session - backed by Supabase Auth, cached to localStorage under the
 * SAME keys as before so every page that reads getCurrentUser()/getToken()
 * synchronously keeps working unmodified.
 * ============================================================ */
function mapProfileToUser(row, email) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: email || row.email,
    university: row.university,
    course: row.course,
    yearOfStudy: row.year_of_study,
    bio: row.bio,
    phone: row.phone,
    profilePicture: row.profile_picture,
    isAdmin: row.is_admin,
    referralCode: row.referral_code
  };
}

async function syncSessionCache(session) {
  if (!session) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, session.access_token);
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (profile) {
    localStorage.setItem(USER_KEY, JSON.stringify(mapProfileToUser(profile, session.user.email)));
  }
}

// Keep the cache fresh across tabs, token refreshes, and sign-in/out.
supabase.auth.onAuthStateChange((_event, session) => {
  syncSessionCache(session);
});
// Also sync once immediately on page load (the listener above only fires
// on the NEXT change, not the current state).
supabase.auth.getSession().then(({ data }) => syncSessionCache(data.session));

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
export function isLoggedIn() {
  return !!getToken();
}
export function setSession(token, user) {
  // Kept for compatibility with any code that still calls this directly
  // (e.g. right after supabase.auth.signInWithPassword resolves, before
  // the onAuthStateChange listener above has had a chance to fire).
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export async function clearSession() {
  await supabase.auth.signOut();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function getUserId() {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) {
    const err = new Error('Not signed in');
    err.status = 401;
    throw err;
  }
  return uid;
}

/* ============================================================
 * Subscription gate - mirrors the old 402 SUBSCRIPTION_REQUIRED/EXPIRED
 * contract that timetable/gpa/budget/reminders/bookmarks pages already
 * check for. RLS enforces the real security; this just reproduces the
 * same page-routing behaviour those pages already have, since RLS denies
 * silently (empty rows) rather than throwing an error a page can catch.
 * Cached in-memory for a few seconds since a page load triggers several
 * gated calls back to back.
 * ============================================================ */
let subCache = null;
let subCacheAt = 0;
async function assertActiveSubscription() {
  const now = Date.now();
  if (!subCache || now - subCacheAt > 15000) {
    subCache = await request('/payments/subscription', { method: 'GET' });
    subCacheAt = now;
  }
  if (subCache.status !== 'active') {
    const err = new Error(subCache.status === 'expired' ? 'Your subscription has expired.' : 'An active subscription is required.');
    err.code = subCache.status === 'expired' ? 'SUBSCRIPTION_EXPIRED' : 'SUBSCRIPTION_REQUIRED';
    throw err;
  }
}
const SUBSCRIPTION_GATED_TABLES = [];

function throwSupabaseError(error) {
  const err = new Error(error.message || 'Request failed');
  err.status = 400;
  throw err;
}

/* ============================================================
 * Generic Supabase-backed table helpers
 * ============================================================ */
async function gate(table) {
  if (SUBSCRIPTION_GATED_TABLES.includes(table)) await assertActiveSubscription();
}

async function listOwn(table, orderCols) {
  await gate(table);
  const uid = await getUserId();
  let q = supabase.from(table).select('*').eq('user_id', uid);
  orderCols.forEach(([col, opts]) => { q = q.order(col, opts); });
  const { data, error } = await q;
  if (error) throwSupabaseError(error);
  return { data };
}
async function getOneOwn(table, id) {
  await gate(table);
  const uid = await getUserId();
  const { data, error } = await supabase.from(table).select('*').eq('id', id).eq('user_id', uid).single();
  if (error) throwSupabaseError(error);
  return { data };
}
async function createOwn(table, body) {
  await gate(table);
  const uid = await getUserId();
  const { data, error } = await supabase.from(table).insert({ ...body, user_id: uid }).select().single();
  if (error) throwSupabaseError(error);
  return { data };
}
async function updateOwn(table, id, body) {
  await gate(table);
  const uid = await getUserId();
  const { data, error } = await supabase.from(table).update(body).eq('id', id).eq('user_id', uid).select().single();
  if (error) throwSupabaseError(error);
  return { data };
}
async function removeOwn(table, id) {
  await gate(table);
  const uid = await getUserId();
  const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', uid);
  if (error) throwSupabaseError(error);
  return null;
}

async function listPublic(table, { search, searchCols, typeCol, typeVal, orderCols }) {
  let q = supabase.from(table).select('*');
  if (search && searchCols?.length) {
    q = q.or(searchCols.map((c) => `${c}.ilike.%${search}%`).join(','));
  }
  if (typeCol && typeVal) q = q.eq(typeCol, typeVal);
  (orderCols || [['created_at', { ascending: false }]]).forEach(([col, opts]) => { q = q.order(col, opts); });
  const { data, error } = await q;
  if (error) throwSupabaseError(error);
  return { data };
}
async function getOnePublic(table, id) {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error) throwSupabaseError(error);
  return { data };
}
async function createAdmin(table, body) {
  const uid = await getUserId();
  const { data, error } = await supabase.from(table).insert({ ...body, created_by: uid }).select().single();
  if (error) throwSupabaseError(error);
  return { data };
}
async function updateAdmin(table, id, body) {
  const { data, error } = await supabase.from(table).update(body).eq('id', id).select().single();
  if (error) throwSupabaseError(error);
  return { data };
}
async function removeAdmin(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throwSupabaseError(error);
  return null;
}

/* ============================================================
 * Dashboard - client-side composition replacing the old single
 * /dashboard Express route. Runs in parallel; getWithCache (below) still
 * gives dashboard.js its 0ms instant-paint from localStorage exactly as
 * before, this just changes where the fresh data comes from.
 * ============================================================ */
async function loadDashboard() {
  const uid = await getUserId();
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  const dayOfWeek = today.getDay();

  const [verse, quote, timetable, reminders, opportunities, helb, budget, gpa] = await Promise.all([
    supabase.from('bible_verses').select('verse_text, reference').eq('date_assigned', isoDate).limit(1).maybeSingle()
      .then((r) => r.data || supabase.from('bible_verses').select('verse_text, reference').limit(1).then((r2) => r2.data?.[0])),
    supabase.from('motivational_quotes').select('quote_text, author').eq('date_assigned', isoDate).limit(1).maybeSingle()
      .then((r) => r.data || supabase.from('motivational_quotes').select('quote_text, author').limit(1).then((r2) => r2.data?.[0])),
    supabase.from('study_timetables').select('*').eq('user_id', uid).eq('day_of_week', dayOfWeek).order('start_time'),
    supabase.from('cat_reminders').select('*').eq('user_id', uid).eq('completed', false).gt('due_date', new Date().toISOString()).order('due_date').limit(5),
    supabase.from('opportunities').select('*').eq('opportunity_type', 'internship').order('created_at', { ascending: false }).limit(4),
    supabase.from('helb_updates').select('*').order('created_at', { ascending: false }).limit(4),
    supabase.rpc('budget_summary'),
    supabase.rpc('cumulative_gpa')
  ]);

  return {
    date: today.toISOString(),
    dailyBibleVerse: verse || null,
    dailyMotivation: quote || null,
    todaysTimetable: timetable.data || [],
    upcomingReminders: reminders.data || [],
    latestInternships: opportunities.data || [],
    helbUpdates: helb.data || [],
    budgetSummary: budget.data || { balance: 0 },
    cumulativeGpa: gpa.data ?? null
  };
}

/* ============================================================
 * /auth/* - now backed by Supabase Auth + the profiles table.
 * ============================================================ */
async function authRegister(body) {
  const { name, email, password, university, course, yearOfStudy, referralCode } = body;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        university,
        course,
        year_of_study: yearOfStudy != null ? String(yearOfStudy) : '',
        referral_code_input: referralCode || ''
      }
    }
  });
  if (error) throwSupabaseError(error);
  await syncSessionCache(data.session);
  return { token: data.session?.access_token, user: getCurrentUser() };
}
async function authLogin(body) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });
  if (error) throwSupabaseError(error);
  await syncSessionCache(data.session);
  return { token: data.session?.access_token, user: getCurrentUser() };
}
async function authForgotPassword(body) {
  const { error } = await supabase.auth.resetPasswordForEmail(body.email, {
    redirectTo: `${window.location.origin}/pages/reset-password.html`
  });
  if (error) throwSupabaseError(error);
  return { message: 'If that email exists, a reset link has been sent.' };
}
async function authUpdateMe(body) {
  const uid = await getUserId();
  const patch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.university !== undefined) patch.university = body.university;
  if (body.course !== undefined) patch.course = body.course;
  if (body.yearOfStudy !== undefined) patch.year_of_study = body.yearOfStudy;
  if (body.bio !== undefined) patch.bio = body.bio;
  if (body.profilePicture !== undefined) patch.profile_picture = body.profilePicture;
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', uid).select().single();
  if (error) throwSupabaseError(error);
  const user = mapProfileToUser(data, getCurrentUser()?.email);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return { user };
}
async function authReferrals() {
  const uid = await getUserId();
  const { data: me, error } = await supabase.from('profiles').select('referral_code').eq('id', uid).single();
  if (error) throwSupabaseError(error);
  const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('referred_by', uid);
  return { referralCode: me.referral_code, referredCount: count || 0 };
}

/* ============================================================
 * Bookmarks - camelCase <-> snake_case mapping at the boundary only.
 * ============================================================ */
async function bookmarksCreate(body) {
  await gate('bookmarks');
  const uid = await getUserId();
  const { data, error } = await supabase.from('bookmarks')
    .insert({ user_id: uid, item_type: body.itemType, item_id: body.itemId })
    .select().single();
  if (error && error.code !== '23505') throwSupabaseError(error); // 23505 = already bookmarked (unique violation)
  return { data: data || { message: 'Already bookmarked' } };
}

/* ============================================================
 * Reminder preferences - singleton per user, lazily created with defaults.
 * ============================================================ */
async function reminderPrefsGet() {
  const uid = await getUserId();
  const { data } = await supabase.from('reminder_preferences').select('*').eq('user_id', uid).maybeSingle();
  if (!data) {
    return { data: { smsEnabled: false, emailEnabled: true, classReminder60min: true, classReminder30min: true, catIntervalDays: 4 } };
  }
  return {
    data: {
      smsEnabled: data.sms_enabled, emailEnabled: data.email_enabled,
      classReminder60min: data.class_reminder_60min, classReminder30min: data.class_reminder_30min,
      catIntervalDays: data.cat_interval_days
    }
  };
}
async function reminderPrefsUpdate(body) {
  const uid = await getUserId();
  const patch = { user_id: uid };
  if (body.smsEnabled !== undefined) patch.sms_enabled = body.smsEnabled;
  if (body.emailEnabled !== undefined) patch.email_enabled = body.emailEnabled;
  if (body.classReminder60min !== undefined) patch.class_reminder_60min = body.classReminder60min;
  if (body.classReminder30min !== undefined) patch.class_reminder_30min = body.classReminder30min;
  if (body.catIntervalDays !== undefined) patch.cat_interval_days = body.catIntervalDays;
  const { data, error } = await supabase.from('reminder_preferences').upsert(patch).select().single();
  if (error) throwSupabaseError(error);
  return {
    data: {
      smsEnabled: data.sms_enabled, emailEnabled: data.email_enabled,
      classReminder60min: data.class_reminder_60min, classReminder30min: data.class_reminder_30min,
      catIntervalDays: data.cat_interval_days
    }
  };
}

/* ============================================================
 * Path router - dispatches a parsed request to the right handler above,
 * or falls through to Express for the paths in EXPRESS_PREFIXES.
 * ============================================================ */
async function routeToSupabase(path, method, body) {
  const [rawPath, queryString] = path.split('?');
  const params = new URLSearchParams(queryString || '');
  const parts = rawPath.split('/').filter(Boolean);

  // /dashboard
  if (parts[0] === 'dashboard') return loadDashboard();

  // /auth/*
  if (parts[0] === 'auth') {
    if (parts[1] === 'register') return authRegister(body);
    if (parts[1] === 'login') return authLogin(body);
    if (parts[1] === 'forgot-password') return authForgotPassword(body);
    if (parts[1] === 'me') return authUpdateMe(body);
    if (parts[1] === 'referrals') return authReferrals();
  }

  // /timetable[/:id]
  if (parts[0] === 'timetable') {
    if (parts[1] && method === 'GET') return getOneOwn('study_timetables', parts[1]);
    if (parts[1] && method === 'PUT') return updateOwn('study_timetables', parts[1], body);
    if (parts[1] && method === 'DELETE') return removeOwn('study_timetables', parts[1]);
    if (method === 'POST') return createOwn('study_timetables', body);
    return listOwn('study_timetables', [['day_of_week', { ascending: true }], ['start_time', { ascending: true }]]);
  }

  // /gpa[/:id], /gpa/summary/all
  if (parts[0] === 'gpa') {
    if (parts[1] === 'summary') {
      const uid = await getUserId();
      const [sem, cum] = await Promise.all([supabase.rpc('gpa_summary'), supabase.rpc('cumulative_gpa')]);
      return { semesters: sem.data || [], cumulativeGpa: cum.data ?? null };
    }
    if (parts[1] && method === 'GET') return getOneOwn('gpa_records', parts[1]);
    if (parts[1] && method === 'PUT') return updateOwn('gpa_records', parts[1], body);
    if (parts[1] && method === 'DELETE') return removeOwn('gpa_records', parts[1]);
    if (method === 'POST') return createOwn('gpa_records', body);
    return listOwn('gpa_records', [['semester', { ascending: true }], ['created_at', { ascending: true }]]);
  }

  // /budget[/:id], /budget/summary/month?month=YYYY-MM
  if (parts[0] === 'budget') {
    if (parts[1] === 'summary') {
      await gate('budget_records');
      const { data, error } = await supabase.rpc('budget_summary', { p_month: params.get('month') || undefined });
      if (error) throwSupabaseError(error);
      return data;
    }
    if (parts[1] && method === 'GET') return getOneOwn('budget_records', parts[1]);
    if (parts[1] && method === 'PUT') return updateOwn('budget_records', parts[1], body);
    if (parts[1] && method === 'DELETE') return removeOwn('budget_records', parts[1]);
    if (method === 'POST') return createOwn('budget_records', body);
    return listOwn('budget_records', [['record_date', { ascending: false }], ['created_at', { ascending: false }]]);
  }

  // /bookmarks[/:id]
  if (parts[0] === 'bookmarks') {
    if (parts[1] && method === 'DELETE') return removeOwn('bookmarks', parts[1]);
    if (method === 'POST') return bookmarksCreate(body);
    return listOwn('bookmarks', [['created_at', { ascending: false }]]);
  }

  // /reminders[/:id][/complete]
  if (parts[0] === 'reminders') {
    if (parts[1] && parts[2] === 'complete') return updateOwn('cat_reminders', parts[1], { completed: true });
    if (parts[1] && method === 'GET') return getOneOwn('cat_reminders', parts[1]);
    if (parts[1] && method === 'PUT') return updateOwn('cat_reminders', parts[1], body);
    if (parts[1] && method === 'DELETE') return removeOwn('cat_reminders', parts[1]);
    if (method === 'POST') return createOwn('cat_reminders', body);
    return listOwn('cat_reminders', [['due_date', { ascending: true }]]);
  }

  // /reminder-preferences
  if (parts[0] === 'reminder-preferences') {
    if (method === 'PUT') return reminderPrefsUpdate(body);
    return reminderPrefsGet();
  }

  // /announcements, /helb, /opportunities (public read, admin write)
  const PUBLIC_TABLES = {
    announcements: { table: 'announcements', searchCols: ['title', 'content'] },
    helb: { table: 'helb_updates', searchCols: ['title', 'content'], typeCol: 'update_type', typeParam: 'type' },
    opportunities: { table: 'opportunities', searchCols: ['title', 'description', 'organization'], typeCol: 'opportunity_type', typeParam: 'type', orderCols: [['deadline', { ascending: true, nullsFirst: false }]] }
  };
  if (PUBLIC_TABLES[parts[0]]) {
    const cfg = PUBLIC_TABLES[parts[0]];
    if (parts[1] && method === 'GET') return getOnePublic(cfg.table, parts[1]);
    if (parts[1] && method === 'PUT') return updateAdmin(cfg.table, parts[1], body);
    if (parts[1] && method === 'DELETE') return removeAdmin(cfg.table, parts[1]);
    if (method === 'POST') return createAdmin(cfg.table, body);
    return listPublic(cfg.table, {
      search: params.get('search'),
      searchCols: cfg.searchCols,
      typeCol: cfg.typeCol,
      typeVal: cfg.typeParam ? params.get(cfg.typeParam) : null,
      orderCols: cfg.orderCols
    });
  }

  // /inspiration/verses, /inspiration/quotes
  if (parts[0] === 'inspiration') {
    const table = parts[1] === 'verses' ? 'bible_verses' : 'motivational_quotes';
    if (parts[2] && method === 'PUT') return updateAdmin(table, parts[2], body);
    if (parts[2] && method === 'DELETE') return removeAdmin(table, parts[2]);
    if (method === 'POST') return createAdmin(table, body);
    return listPublic(table, { orderCols: [['date_assigned', { ascending: false }]] });
  }

  throw new Error(`No Supabase route configured for ${method} ${path}`);
}

/* ============================================================
 * Express passthrough (payments, coffee, admin users/stats/transactions,
 * past papers) - unchanged fetch-based client, just reads the token from
 * Supabase now instead of our own issued JWT.
 * ============================================================ */
async function request(path, { method = 'GET', body, auth = true, isForm = false } = {}) {
  if (!isExpressPath(path)) {
    return routeToSupabase(path, method, body);
  }

  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  const response = await fetch(`${EXPRESS_API_BASE_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined)
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => ({})) : null;

  if (!response.ok) {
    const message = (data && (data.message || data.error)) || `Request failed with status ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body, opts = {}) => request(path, { method: 'POST', body, ...opts }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  // Multipart variants - only used for past-paper file uploads (Express).
  postForm: (path, formData) => request(path, { method: 'POST', body: formData, isForm: true }),
  putForm: (path, formData) => request(path, { method: 'PUT', body: formData, isForm: true })
};

/* ============================================================
 * Instant-paint cache - unchanged from before. Backend swap doesn't
 * affect this at all; it's purely a localStorage read/write helper.
 * ============================================================ */
const CACHE_PREFIX = 'msomi_cache_';

export function getCached(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCached(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // Storage full or unavailable - not critical, just skip caching.
  }
}

const SUBSCRIPTION_ERROR_CODES = ['SUBSCRIPTION_REQUIRED', 'SUBSCRIPTION_EXPIRED'];

export async function getWithCache(path, cacheKey, { onCache, onFresh, onError } = {}) {
  const cached = getCached(cacheKey);
  if (cached && onCache) onCache(cached);

  try {
    const fresh = await request(path, { method: 'GET' });
    setCached(cacheKey, fresh);
    if (onFresh) onFresh(fresh);
    return fresh;
  } catch (err) {
    const isSubscriptionError = SUBSCRIPTION_ERROR_CODES.includes(err.code);
    if ((!cached || isSubscriptionError) && onError) onError(err);
    throw err;
  }
}

export function requireAuthOrRedirect() {
  if (!isLoggedIn()) {
    window.location.href = '/pages/login.html';
  }
}

export async function requireSubscriptionOrRedirect() {
  try {
    const sub = await request('/payments/subscription', { method: 'GET' });
    if (sub.status !== 'active') {
      window.location.href = '/pages/subscribe.html';
      return false;
    }
    return true;
  } catch (err) {
    return true;
  }
}
