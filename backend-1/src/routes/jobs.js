// /api/jobs – katalóg aktívnych pracovných ponúk (obrazovka 1). Verejné.
// Zobrazujú sa iba otvorené pozície, ktorým ešte neprešla uzávierka.

const express = require('express');
const db = require('../db/azureSql');
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/validate');
const { jobColumns, PUBLIC_JOB_SQL } = require('../utils/jobInput');

const router = express.Router();

// GET /api/jobs – zoznam verejných pozícií, najnovšie zverejnené prvé
router.get('/', async (req, res) => {
  const { recordset } = await db.query(
    `SELECT ${jobColumns('j')}
     FROM dbo.jobs j
     WHERE ${PUBLIC_JOB_SQL('j')}
     ORDER BY j.published_at DESC, j.id DESC`
  );
  res.json({ jobs: recordset });
});

// GET /api/jobs/:id – detail verejnej pozície
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { recordset } = await db.query(
    `SELECT ${jobColumns('j')}
     FROM dbo.jobs j
     WHERE j.id = @id AND ${PUBLIC_JOB_SQL('j')}`,
    { id }
  );
  if (!recordset[0]) throw new HttpError(404, 'Pozícia neexistuje');
  res.json({ job: recordset[0] });
});

module.exports = router;
