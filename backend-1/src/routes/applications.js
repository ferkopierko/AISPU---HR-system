// /api/applications – prihlášky prihláseného používateľa (obrazovka 1).

const express = require('express');
const db = require('../db/azureSql');
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const SQL_UNIQUE_VIOLATION = [2627, 2601];

// POST /api/applications  { jobId }
// Prihláška sa vždy priradí používateľovi zo session, nie z tela požiadavky.
router.post('/', requireAuth, async (req, res) => {
  const jobId = parseId(req.body?.jobId, 'jobId');
  const userId = req.session.userId;

  const job = await db.query(
    `SELECT id FROM dbo.jobs WHERE id = @jobId AND status = N'open'`,
    { jobId }
  );
  if (!job.recordset[0]) throw new HttpError(404, 'Pozícia neexistuje alebo je uzavretá');

  try {
    const { recordset } = await db.query(
      `INSERT INTO dbo.applications (user_id, job_id)
       OUTPUT inserted.id, inserted.job_id AS jobId, inserted.status, inserted.created_at AS createdAt
       VALUES (@userId, @jobId)`,
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
