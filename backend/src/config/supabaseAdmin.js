const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[supabaseAdmin] WARNING: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.');
}

// Service-role client - bypasses Row Level Security entirely. Only ever
// used server-side (never sent to the frontend) for: uploading past papers
// to Storage, issuing short-lived signed URLs for view/download, and any
// admin action that needs to read/write across all users.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = { supabaseAdmin };
