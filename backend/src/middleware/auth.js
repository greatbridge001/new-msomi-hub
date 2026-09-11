const { query } = require('../config/db');
const { supabaseAdmin } = require('../config/supabaseAdmin');

// Supabase projects can sign access tokens with either the legacy HS256
// shared secret or the newer asymmetric (ECC/RSA) signing keys - which one
// is in effect can change after a key rotation. Verifying via
// supabaseAdmin.auth.getUser() asks Supabase itself to check the token,
// so it works correctly no matter which key type signed it - no shared
// secret to keep in sync.
async function loadUser(token) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    console.error('[auth] getUser failed:', error?.message || error);
    const e = new Error('Invalid or expired token');
    e.detail = error?.message || String(error);
    throw e;
  }
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
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    req.user = await loadUser(token);
    return next();
  } catch (err) {
    console.error('[auth] requireAuth rejected:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token', detail: err.detail || err.message || null });
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