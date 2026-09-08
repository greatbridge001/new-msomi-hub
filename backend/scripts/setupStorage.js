require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Run once after creating your Supabase project: `npm run setup:storage`.
// Creates the private "revision-papers" bucket if it doesn't already
// exist. Safe to run multiple times.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = 'revision-papers';

(async () => {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error('[setupStorage] could not list buckets:', listError.message);
    process.exit(1);
  }

  if (buckets.some((b) => b.name === BUCKET)) {
    console.log(`[setupStorage] bucket "${BUCKET}" already exists - nothing to do.`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: '25MB',
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  });

  if (createError) {
    console.error('[setupStorage] failed to create bucket:', createError.message);
    process.exit(1);
  }

  console.log(`[setupStorage] created private bucket "${BUCKET}".`);
})();
