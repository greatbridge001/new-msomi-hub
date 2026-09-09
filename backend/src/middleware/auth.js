const { query } = require('../config/db');
const { supabaseAdmin } = require('../config/supabaseAdmin');

async function loadUser(token) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new Error('Invalid or expired token');

  const { rows } = await query('SELECT is_admin FROM profiles WHERE id = $1', [data.user.id]);
  return { id: data.user.id, email: data.user.email, isAdmin: !!rows[0]?.is_admin };
}

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

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

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