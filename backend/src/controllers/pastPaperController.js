const crypto = require('crypto');
const { query } = require('../config/db');
const { supabaseAdmin } = require('../config/supabaseAdmin');

const PAPER_TYPES = ['cat', 'exam'];
const BUCKET = 'revision-papers';
const SIGNED_URL_TTL_SECONDS = 300; // 5 min - long enough to load/click, short enough to stop link-sharing
const ALLOWED_MIME = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/webp': 'image'
};

/**
 * GET /api/pastpapers
 * Gated by requirePastPaperAccess at the route level.
 */
async function list(req, res, next) {
  try {
    const { school, course, paperType, academicYear, q } = req.query;
    const conditions = [];
    const params = [];

    if (school) {
      params.push(school);
      conditions.push(`school = $${params.length}`);
    }
    if (course) {
      params.push(`%${course}%`);
      conditions.push(`course ILIKE $${params.length}`);
    }
    if (paperType) {
      params.push(paperType);
      conditions.push(`paper_type = $${params.length}`);
    }
    if (academicYear) {
      params.push(academicYear);
      conditions.push(`academic_year = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(course ILIKE $${params.length} OR unit ILIKE $${params.length} OR school ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // Note: file_paths is intentionally NOT sent here - it holds internal
    // Storage paths, not public URLs. The frontend calls
    // GET /:id/access-url to get short-lived signed URLs only when a
    // student actually opens a specific paper, keeping the list response
    // small and never leaking a path a student hasn't paid to open.
    const result = await query(
      `SELECT id, school, course, unit, paper_type, academic_year,
              jsonb_array_length(file_paths) AS page_count, created_at
       FROM past_papers ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/pastpapers/meta
 */
async function meta(req, res, next) {
  try {
    const [schools, years] = await Promise.all([
      query('SELECT DISTINCT school FROM past_papers ORDER BY school ASC'),
      query('SELECT DISTINCT academic_year FROM past_papers ORDER BY academic_year DESC')
    ]);
    res.json({
      schools: schools.rows.map((r) => r.school),
      academicYears: years.rows.map((r) => r.academic_year),
      paperTypes: PAPER_TYPES
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/pastpapers/:id/access-url?mode=view|download
 * Paywalled (requirePastPaperAccess). Returns one short-lived signed URL
 * per uploaded file for this paper. `mode=download` sets a
 * content-disposition header that forces a save-to-device prompt;
 * `mode=view` (default) lets the browser render it inline (PDF viewer for
 * PDFs, straight display for images).
 */
async function getAccessUrl(req, res, next) {
  try {
    const mode = req.query.mode === 'download' ? 'download' : 'view';
    const result = await query('SELECT file_paths, course, unit FROM past_papers WHERE id = $1', [req.params.id]);
    const paper = result.rows[0];
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const files = paper.file_paths || [];
    const signed = await Promise.all(
      files.map(async (f, index) => {
        const filename = `${paper.course}-${paper.unit || 'paper'}-${index + 1}.${f.type === 'pdf' ? 'pdf' : 'jpg'}`
          .replace(/\s+/g, '-');
        const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(
          f.path,
          SIGNED_URL_TTL_SECONDS,
          mode === 'download' ? { download: filename } : undefined
        );
        if (error) throw error;
        return { path: f.path, type: f.type, url: data.signedUrl };
      })
    );

    res.json({ data: signed, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/pastpapers
 * Admin only. multipart/form-data: fields (school, course, unit,
 * paperType, academicYear) + one or more `files` (PDF or image).
 * Uploads straight to Supabase Storage (private bucket) using the service
 * role, then stores the resulting paths (not public URLs) in the DB.
 */
async function create(req, res, next) {
  try {
    const { school, course, unit, paperType, academicYear } = req.body;
    const files = req.files || [];

    if (!school || !course || !paperType || !academicYear) {
      return res.status(400).json({ error: 'school, course, paperType and academicYear are required' });
    }
    if (!PAPER_TYPES.includes(paperType)) {
      return res.status(400).json({ error: `paperType must be one of: ${PAPER_TYPES.join(', ')}` });
    }
    if (!files.length) {
      return res.status(400).json({ error: 'At least one uploaded file (PDF or image) is required' });
    }

    const filePaths = [];
    for (const file of files) {
      const kind = ALLOWED_MIME[file.mimetype];
      if (!kind) {
        return res.status(400).json({ error: `Unsupported file type: ${file.mimetype}. Use PDF, JPEG, PNG or WebP.` });
      }
      const ext = file.originalname.split('.').pop();
      const objectPath = `${school}/${course}/${academicYear}-${paperType}-${crypto.randomBytes(6).toString('hex')}.${ext}`
        .replace(/\s+/g, '-');

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (uploadError) throw uploadError;

      filePaths.push({ path: objectPath, type: kind });
    }

    const result = await query(
      `INSERT INTO past_papers (school, course, unit, paper_type, academic_year, file_paths, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, school, course, unit, paper_type, academic_year, created_at`,
      [school, course, unit || null, paperType, academicYear, JSON.stringify(filePaths), req.user.id]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/pastpapers/:id
 * Admin only. Same fields as create; if new files are attached they
 * REPLACE the full set (old Storage objects are deleted to avoid orphans).
 */
async function update(req, res, next) {
  try {
    const { school, course, unit, paperType, academicYear } = req.body;
    const files = req.files || [];

    if (paperType && !PAPER_TYPES.includes(paperType)) {
      return res.status(400).json({ error: `paperType must be one of: ${PAPER_TYPES.join(', ')}` });
    }

    let filePathsJson = null;
    if (files.length) {
      const existing = await query('SELECT file_paths, school, course FROM past_papers WHERE id = $1', [req.params.id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Paper not found' });

      const oldPaths = (existing.rows[0].file_paths || []).map((f) => f.path);
      const effectiveSchool = school || existing.rows[0].school;
      const effectiveCourse = course || existing.rows[0].course;

      const filePaths = [];
      for (const file of files) {
        const kind = ALLOWED_MIME[file.mimetype];
        if (!kind) {
          return res.status(400).json({ error: `Unsupported file type: ${file.mimetype}` });
        }
        const ext = file.originalname.split('.').pop();
        const objectPath = `${effectiveSchool}/${effectiveCourse}/${academicYear || 'update'}-${crypto.randomBytes(6).toString('hex')}.${ext}`
          .replace(/\s+/g, '-');
        const { error: uploadError } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });
        if (uploadError) throw uploadError;
        filePaths.push({ path: objectPath, type: kind });
      }
      filePathsJson = JSON.stringify(filePaths);

      if (oldPaths.length) {
        await supabaseAdmin.storage.from(BUCKET).remove(oldPaths);
      }
    }

    const result = await query(
      `UPDATE past_papers SET
         school = COALESCE($1, school),
         course = COALESCE($2, course),
         unit = COALESCE($3, unit),
         paper_type = COALESCE($4, paper_type),
         academic_year = COALESCE($5, academic_year),
         file_paths = COALESCE($6, file_paths),
         updated_at = NOW()
       WHERE id = $7 RETURNING id, school, course, unit, paper_type, academic_year, updated_at`,
      [school || null, course || null, unit || null, paperType || null, academicYear || null, filePathsJson, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Paper not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/pastpapers/:id
 * Admin only. Deletes both the DB row and its Storage objects.
 */
async function remove(req, res, next) {
  try {
    const result = await query('DELETE FROM past_papers WHERE id = $1 RETURNING file_paths', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Paper not found' });

    const paths = (result.rows[0].file_paths || []).map((f) => f.path);
    if (paths.length) {
      await supabaseAdmin.storage.from(BUCKET).remove(paths);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, meta, getAccessUrl, create, update, remove };
