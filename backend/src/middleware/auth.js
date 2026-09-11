const { query } = require('../config/db');
const { supabaseAdmin } = require('../config/supabaseAdmin');

// Verifying against the Auth server (supabase.auth.getUser) instead of
// checking the signature locally with a shared secret - this is
// Supabase's own current recommendation, and it sidesteps an entire class
// of config bugs (wrong/missing secret, or a project that's since rotated
// to their newer asymmetric signing keys, which a locally-checked HS256
// secret can't verify at all). Slightly slower per request since it's a
// network round-trip, but correctness first - this app's traffic doesn't
// come close to where that matters.
async function loadUser(token) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new Error(error?.message || 'No user for this token');

  const { rows } = await query('SELECT is_admin FROM profiles WHERE id = $1', [data.user.id]);
  return { id: data.user.id, email: data.user.email, isAdmin: !!rows[0]?.is_admin };
}

/**
 * Requires a valid Supabase access token. Attaches { id, email, isAdmin } to req.user.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    console.error('[requireAuth] missing or malformed Authorization header:', header ? header.slice(0, 20) + '...' : '(empty)');
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    req.user = await loadUser(token);
    return next();
  } catch (err) {
    console.error('[requireAuth] token check failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Requires req.user.isAdmin === true. Must run after requireAuth.
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

/**
 * Optional auth: attaches req.user if a valid token is present, but does not
 * reject the request if it's missing.
 */
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      req.user = await loadUser(token);
    } catch (err) {
      // ignore invalid token for optional auth
    }
  }
  return next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth };