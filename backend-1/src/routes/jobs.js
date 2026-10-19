// /api/jobs – katalóg aktívnych pracovných ponúk (obrazovka 1). Verejné.

const express = require('express');
const db = require('../db/azureSql');
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/validate');

const router = express.Router();

// GET /api/jobs – zoznam otvorených pozícií
router.get('/', async (req, res) => {
  const { recordset } = await db.query(
    `SELECT id, title, department, description, requirements, status
     FROM dbo.jobs
     WHERE status = N'open'
     ORDER BY id DESC`
  );
  res.json({ jobs: recordset });
});

// GET /api/jobs/:id – detail otvorenej pozície
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { recordset } = await db.query(
    `SELECT id, title, department, description, requirements, status
     FROM dbo.jobs
     WHERE id = @id AND status = N'open'`,
    { id }
  );
  if (!recordset[0]) throw new HttpError(404, 'Pozícia neexistuje');
  res.json({ job: recordset[0] });
});

module.exports = router;
