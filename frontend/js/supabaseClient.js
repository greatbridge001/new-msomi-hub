// Loaded from a CDN so no bundler/build step is needed for this static
// site - swap for an npm import if you later move to a bundled frontend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public by design: the anon key is safe to ship to the browser - it can
// only do what Row Level Security policies in schema.sql allow for
// whichever user is signed in (or nothing, if signed out).
const SUPABASE_URL = 'https://prkpanzpfvvplkdxqync.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBya3BhbnpwZnZ2cGxrZHhxeW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjgzNTEsImV4cCI6MjEwNDQ0NDM1MX0.ZMZbR1K7-2ZhPM0clzkuxTHDAvzF7_MkgDI-ElWdHU8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
