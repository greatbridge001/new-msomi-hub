const { query } = require('../config/db');

/**
 * Requires the logged-in user to have an active, non-expired subscription.
 * Must run after requireAuth (needs req.user.id).
 *
 * On expiry, flips the row to 'expired' lazily on read so the dashboard/
 * admin views stay accurate without needing a cron job.
 */
async function requireActiveSubscription(req, res, next) {
  try {
    // Site-wide free access toggle - bypass the paywall for everyone.
    if (process.env.FREE_MODE === 'true') {
      req.subscription = { status: 'active', free_mode: true };
      return next();
    }

    // Admins get full access without needing a paid subscription.
    if (req.user.isAdmin) {
      req.subscription = { status: 'active', is_admin_bypass: true };
      return next();
    }

    const result = await query('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
    const sub = result.rows[0];

    if (!sub || sub.status === 'inactive') {
      return res.status(402).json({
        error: 'Payment required',
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Pay a one-time fee to unlock all StudentFlow features for the year.'
      });
    }

    if (sub.status === 'active' && sub.expires_at && new Date(sub.expires_at) < new Date()) {
      await query(`UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE user_id = $1`, [req.user.id]);
      return res.status(402).json({
        error: 'Payment required',
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Your StudentFlow subscription has expired. Renew to keep using all features.'
      });
    }

    if (sub.status === 'expired') {
      return res.status(402).json({
        error: 'Payment required',
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Your StudentFlow subscription has expired. Renew to keep using all features.'
      });
    }

    req.subscription = sub;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireActiveSubscription };