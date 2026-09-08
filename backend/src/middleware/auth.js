const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

// Supabase signs every access token it issues with this project-level
// secret (Dashboard -> Project Settings -> API -> JWT Settings -> JWT
// Secret). Verifying locally means Express never has to make a network
// call to Supabase just to check a token - the same speed win as before,
// just against a token we no longer issue ourselves.
const SECRET = process.env.SUPABASE_JWT_SECRET;

async function loadUser(token) {
  if (!SECRET) throw new Error('SUPABASE_JWT_SECRET is not configured');
  const decoded = jwt.verify(token, SECRET); // throws on invalid/expired
  const { rows } = await query('SELECT is_admin FROM profiles WHERE id = $1', [decoded.sub]);
  return { id: decoded.sub, email: decoded.email, isAdmin: !!rows[0]?.is_admin };
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
