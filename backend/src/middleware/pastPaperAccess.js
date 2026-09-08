const { query } = require('../config/db');

/**
 * Requires the logged-in user to have active, non-expired past-paper
 * access. Separate from requireActiveSubscription (subscription.js) - a
 * student can have a fully active main subscription and still not have
 * paid for this section, since it's a distinct KES 50/semester charge.
 * Must run after requireAuth (needs req.user.id).
 */
async function requirePastPaperAccess(req, res, next) {
  try {
    // Site-wide free access toggle - same escape hatch as the main paywall.
    if (process.env.FREE_MODE === 'true') {
      req.pastPaperAccess = { status: 'active', free_mode: true };
      return next();
    }

    // Admins always have full access, same convention as every other
    // admin-managed/paywalled section on the site.
    if (req.user.isAdmin) {
      req.pastPaperAccess = { status: 'active', is_admin_bypass: true };
      return next();
    }

    const result = await query('SELECT * FROM past_paper_access WHERE user_id = $1', [req.user.id]);
    const access = result.rows[0];

    if (!access || access.status === 'inactive') {
      return res.status(402).json({
        error: 'Payment required',
        code: 'PASTPAPER_ACCESS_REQUIRED',
        message: 'Pay KES 50 to unlock revision materials for this semester.'
      });
    }

    if (access.status === 'active' && access.expires_at && new Date(access.expires_at) < new Date()) {
      await query(`UPDATE past_paper_access SET status = 'expired', updated_at = NOW() WHERE user_id = $1`, [req.user.id]);
      return res.status(402).json({
        error: 'Payment required',
        code: 'PASTPAPER_ACCESS_EXPIRED',
        message: 'Your revision materials access has expired. Renew for the new semester.'
      });
    }

    if (access.status === 'expired') {
      return res.status(402).json({
        error: 'Payment required',
        code: 'PASTPAPER_ACCESS_EXPIRED',
        message: 'Your revision materials access has expired. Renew for the new semester.'
      });
    }

    req.pastPaperAccess = access;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requirePastPaperAccess };