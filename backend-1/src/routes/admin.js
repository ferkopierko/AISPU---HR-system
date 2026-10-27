// /api/admin – HR Admin Dashboard (obrazovka 2). Všetko iba pre rolu admin.

const express = require('express');
const db = require('../db/azureSql');
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/validate');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

const ALL_STATUSES = ['submitted', 'reviewing', 'interview', 'accepted', 'rejected'];
// Stavy, ktoré môže HR nastaviť ('submitted' je iba počiatočný).
const SETTABLE_STATUSES = ['reviewing', 'interview', 'accepted', 'rejected'];

const toApplication = (r) => ({
  id: r.id,
  status: r.status,
  createdAt: r.created_at,
  // name / phone z profilu; ak ich uchádzač nevyplnil, tak z CV (Backend 2), inak null
  candidate: { id: r.user_id, email: r.email, name: r.name, phone: r.phone },
  job: { id: r.job_id, title: r.title, department: r.department },
  hasCv: r.has_cv === 1,
});

// GET /api/admin/applications?status=&jobId=  – všetci kandidáti
router.get('/applications', async (req, res) => {
  const where = [];
  const params = {};
  if (req.query.status !== undefined) {
    if (!ALL_STATUSES.includes(req.query.status)) throw new HttpError(400, 'Neplatný stav');
    where.push('a.status = @status');
    params.status = req.query.status;
  }
  if (req.query.jobId !== undefined) {
    where.push('a.job_id = @jobId');
    params.jobId = parseId(req.query.jobId, 'jobId');
  }

  const { recordset } = await db.query(
    `SELECT a.id, a.status, a.created_at, a.user_id, u.email,
            COALESCE(u.full_name, a.candidate_name) AS name, COALESCE(u.phone, a.candidate_phone) AS phone,
            a.job_id, j.title, j.department,
            CASE WHEN EXISTS (SELECT 1 FROM dbo.application_cvs c WHERE c.application_id = a.id)
                 THEN 1 ELSE 0 END AS has_cv
     FROM dbo.applications a
     JOIN dbo.users u ON u.id = a.user_id
     JOIN dbo.jobs  j ON j.id = a.job_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY a.created_at DESC, a.id DESC`,
    params
  );
  res.json({ applications: recordset.map(toApplication) });
});

// PATCH /api/admin/applications/:id/status  { status }
router.patch('/applications/:id/status', async (req, res) => {
  const id = parseId(req.params.id);
  const status = req.body?.status;
  if (!SETTABLE_STATUSES.includes(status)) {
    throw new HttpError(400, `Stav musí byť jeden z: ${SETTABLE_STATUSES.join(', ')}`);
  }

  const { recordset } = await db.query(
    `UPDATE dbo.applications SET status = @status
     OUTPUT inserted.id, inserted.status
     WHERE id = @id`,
    { id, status }
  );
  if (!recordset[0]) throw new HttpError(404, 'Prihláška neexistuje');
  res.json({ application: recordset[0] });
});

// GET /api/admin/applications/:id/cv[?download=1]
// Bez parametra sa PDF zobrazí v prehliadači (náhľad), s download=1 sa stiahne.
router.get('/applications/:id/cv', async (req, res) => {
  const id = parseId(req.params.id);
  const { recordset } = await db.query(
    'SELECT filename, content_type, data FROM dbo.application_cvs WHERE application_id = @id',
    { id }
  );
  const cv = recordset[0];
  if (!cv) throw new HttpError(404, 'K prihláške nie je uložené CV');

  const download = req.query.download === '1' || cv.content_type !== 'application/pdf'; // DOCX prehliadač nezobrazí
  res.set({
    'Content-Type': cv.content_type,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(cv.filename)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store', // osobné údaje
  });
  res.send(cv.data);
});

// GET /api/admin/applications/:id/notes – poznámky HR, najstaršie prvé
router.get('/applications/:id/notes', async (req, res) => {
  const id = parseId(req.params.id);
  const app = await db.query('SELECT id FROM dbo.applications WHERE id = @id', { id });
  if (!app.recordset[0]) throw new HttpError(404, 'Prihláška neexistuje');

  const { recordset } = await db.query(
    `SELECT n.id, n.text, n.created_at, n.author_id, u.email
     FROM dbo.application_notes n
     JOIN dbo.users u ON u.id = n.author_id
     WHERE n.application_id = @id
     ORDER BY n.created_at, n.id`,
    { id }
  );
  res.json({
    notes: recordset.map((n) => ({
      id: n.id,
      text: n.text,
      createdAt: n.created_at,
      author: { id: n.author_id, email: n.email },
    })),
  });
});

// POST /api/admin/applications/:id/notes  { text }
router.post('/applications/:id/notes', async (req, res) => {
  const id = parseId(req.params.id);
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) throw new HttpError(400, 'Poznámka nesmie byť prázdna');
  if (text.length > 2000) throw new HttpError(400, 'Poznámka môže mať najviac 2000 znakov');

  const app = await db.query('SELECT id FROM dbo.applications WHERE id = @id', { id });
  if (!app.recordset[0]) throw new HttpError(404, 'Prihláška neexistuje');

  const { recordset } = await db.query(
    `INSERT INTO dbo.application_notes (application_id, author_id, text)
     OUTPUT inserted.id, inserted.text, inserted.created_at
     VALUES (@id, @authorId, @text)`,
    { id, authorId: req.session.userId, text }
  );
  const { recordset: author } = await db.query('SELECT email FROM dbo.users WHERE id = @id', { id: req.session.userId });
  res.status(201).json({
    note: {
      id: recordset[0].id,
      text: recordset[0].text,
      createdAt: recordset[0].created_at,
      author: { id: req.session.userId, email: author[0]?.email ?? null },
    },
  });
});

module.exports = router;
