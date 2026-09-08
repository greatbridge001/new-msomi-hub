const { query } = require('../config/db');

/**
 * GET /api/admin/stats
 * Top-line numbers for the admin dashboard overview.
 */
async function getStats(req, res, next) {
  try {
    const [users, activeSubs, revenue, referrals, content] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM profiles'),
      query(`SELECT COUNT(*)::int AS count FROM subscriptions WHERE status = 'active' AND expires_at > NOW()`),
      query(`SELECT COALESCE(SUM(amount), 0)::float AS total FROM payment_transactions WHERE status = 'success'`),
      query(`SELECT COUNT(*)::int AS count FROM profiles WHERE referred_by IS NOT NULL`),
      query(`SELECT
               (SELECT COUNT(*) FROM announcements)::int AS announcements,
               (SELECT COUNT(*) FROM helb_updates)::int AS helb_updates,
               (SELECT COUNT(*) FROM opportunities)::int AS opportunities`)
    ]);

    res.json({
      totalUsers: users.rows[0].count,
      activeSubscriptions: activeSubs.rows[0].count,
      totalRevenue: revenue.rows[0].total,
      totalReferrals: referrals.rows[0].count,
      content: content.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/users?search=&subscribed=true
 */
async function listUsers(req, res, next) {
  try {
    const { search, subscribed } = req.query;
    const clauses = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    let result = await query(
      `SELECT u.id, u.name, u.email, u.university, u.course, u.year_of_study, u.is_admin,
              u.referral_code, u.created_at,
              s.status AS subscription_status, s.expires_at AS subscription_expires_at
       FROM profiles u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT 200`,
      params
    );

    if (subscribed === 'true') {
      result.rows = result.rows.filter((r) => r.subscription_status === 'active');
    } else if (subscribed === 'false') {
      result.rows = result.rows.filter((r) => r.subscription_status !== 'active');
    }

    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id
 * Body: { isAdmin?: boolean, grantSubscriptionDays?: number }
 * Lets an admin promote another user to admin, or manually grant/extend a
 * subscription (e.g. for a scholarship recipient, or to fix a failed webhook).
 */
async function updateUser(req, res, next) {
  try {
    const { isAdmin, grantSubscriptionDays } = req.body;

    if (typeof isAdmin === 'boolean') {
      await query('UPDATE profiles SET is_admin = $1, updated_at = NOW() WHERE id = $2', [isAdmin, req.params.id]);
    }

    if (grantSubscriptionDays) {
      const days = Number(grantSubscriptionDays);
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await query(
        `INSERT INTO subscriptions (user_id, status, amount_paid, activated_at, expires_at)
         VALUES ($1, 'active', 0, NOW(), $2)
         ON CONFLICT (user_id) DO UPDATE SET
           status = 'active', activated_at = NOW(), expires_at = $2, updated_at = NOW()`,
        [req.params.id, expiresAt]
      );
    }

    const result = await query('SELECT id, name, email, is_admin FROM profiles WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/transactions?status=success
 */
async function listTransactions(req, res, next) {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = 'WHERE t.status = $1';
    }
    const result = await query(
      `SELECT t.id, t.external_reference, t.checkout_request_id, t.phone_number, t.amount,
              t.status, t.mpesa_receipt_number, t.result_desc, t.created_at,
              u.name AS user_name, u.email AS user_email
       FROM payment_transactions t
       JOIN profiles u ON u.id = t.user_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT 200`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/referral-leaderboard
 * Top referrers - useful for running a "share and win" style campaign.
 */
async function referralLeaderboard(req, res, next) {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.referral_code, COUNT(r.id)::int AS referred_count
       FROM profiles u
       LEFT JOIN profiles r ON r.referred_by = u.id
       GROUP BY u.id
       HAVING COUNT(r.id) > 0
       ORDER BY referred_count DESC
       LIMIT 50`
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats, listUsers, updateUser, listTransactions, referralLeaderboard };
