// /api/applications – prihlášky prihláseného používateľa (obrazovka 1).

const express = require('express');
const db = require('../db/azureSql');
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');
const { PUBLIC_JOB_SQL } = require('../utils/jobInput');

const router = express.Router();
const SQL_UNIQUE_VIOLATION = [2627, 2601];

// GET /api/applications/mine – prihlášky prihláseného používateľa
router.get('/mine', requireAuth, async (req, res) => {
  const { recordset } = await db.query(
    `SELECT a.id, a.status, a.created_at, a.consent_at, j.id AS job_id, j.title, j.department, j.status AS job_status
     FROM dbo.applications a
     JOIN dbo.jobs j ON j.id = a.job_id
     WHERE a.user_id = @userId
     ORDER BY a.created_at DESC, a.id DESC`,
    { userId: req.session.userId }
  );
  res.json({
    applications: recordset.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      consentAt: r.consent_at,
      job: { id: r.job_id, title: r.title, department: r.department, status: r.job_status },
    })),
  });
});

// POST /api/applications  { jobId, consent: true }
// Prihláška sa vždy priradí používateľovi zo session, nie z tela požiadavky.
// Bez súhlasu so spracovaním osobných údajov (GDPR) sa prihláška nevytvorí;
// čas súhlasu sa uloží do applications.consent_at.
router.post('/', requireAuth, async (req, res) => {
  const jobId = parseId(req.body?.jobId, 'jobId');
  if (req.body?.consent !== true) {
    throw new HttpError(400, 'Bez súhlasu so spracovaním osobných údajov nie je možné prihlášku odoslať');
  }
  const userId = req.session.userId;

  const job = await db.query(
    `SELECT j.id FROM dbo.jobs j WHERE j.id = @jobId AND ${PUBLIC_JOB_SQL('j')}`,
    { jobId }
  );
  if (!job.recordset[0]) throw new HttpError(404, 'Pozícia neexistuje, je uzavretá alebo jej prešla uzávierka');

  try {
    const { recordset } = await db.query(
      `INSERT INTO dbo.applications (user_id, job_id, consent_at)
       OUTPUT inserted.id, inserted.job_id AS jobId, inserted.status, inserted.created_at AS createdAt,
              inserted.consent_at AS consentAt
       VALUES (@userId, @jobId, SYSUTCDATETIME())`,
      { userId, jobId }
    );
    res.status(201).json({ application: recordset[0] });
  } catch (err) {
    if (SQL_UNIQUE_VIOLATION.includes(err.number)) {
      throw new HttpError(409, 'Na túto pozíciu ste sa už prihlásili');
    }
    throw err;
  }
});

module.exports = router;
