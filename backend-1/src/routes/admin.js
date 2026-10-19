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
  candidate: { id: r.user_id, email: r.email },
  job: { id: r.job_id, title: r.title, department: r.department },
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
            a.job_id, j.title, j.department
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

module.exports = router;
