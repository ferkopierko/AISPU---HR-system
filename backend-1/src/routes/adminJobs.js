// /api/admin/jobs – správa pracovných pozícií pre HR. Iba rola admin.

const express = require('express');
const db = require('../db/azureSql');
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/validate');
const { parseJobInput, jobColumns } = require('../utils/jobInput');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

const EDITABLE = `title = @title, department = @department, description = @description,
  requirements = @requirements, status = @status, location = @location,
  employment_type = @employmentType, work_mode = @workMode, salary_min = @salaryMin,
  salary_max = @salaryMax, salary_period = @salaryPeriod, responsibilities = @responsibilities,
  benefits = @benefits, deadline = @deadline`;

// GET /api/admin/jobs – všetky pozície vrátane konceptov, uzavretých a po uzávierke
router.get('/', async (req, res) => {
  const { recordset } = await db.query(
    `SELECT ${jobColumns('j')},
            (SELECT COUNT(*) FROM dbo.applications a WHERE a.job_id = j.id) AS applicationCount
     FROM dbo.jobs j
     ORDER BY j.id DESC`
  );
  res.json({ jobs: recordset });
});

// POST /api/admin/jobs – published_at sa nastaví, ak pozícia vznikne rovno otvorená
router.post('/', async (req, res) => {
  const job = parseJobInput(req.body);
  const { recordset } = await db.query(
    `INSERT INTO dbo.jobs (title, department, description, requirements, status, location,
                           employment_type, work_mode, salary_min, salary_max, salary_period,
                           responsibilities, benefits, deadline, published_at)
     OUTPUT ${jobColumns('inserted')}
     VALUES (@title, @department, @description, @requirements, @status, @location,
             @employmentType, @workMode, @salaryMin, @salaryMax, @salaryPeriod,
             @responsibilities, @benefits, @deadline,
             CASE WHEN @status = N'open' THEN SYSUTCDATETIME() END)`,
    job
  );
  res.status(201).json({ job: recordset[0] });
});

// PUT /api/admin/jobs/:id – úplná náhrada (vynechané voliteľné polia sa vymažú).
// published_at sa nastaví pri prvom otvorení a ďalej sa nemení.
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const job = parseJobInput(req.body);
  const { recordset } = await db.query(
    `UPDATE dbo.jobs
     SET ${EDITABLE},
         published_at = CASE WHEN published_at IS NULL AND @status = N'open'
                             THEN SYSUTCDATETIME() ELSE published_at END
     OUTPUT ${jobColumns('inserted')}
     WHERE id = @id`,
    { ...job, id }
  );
  if (!recordset[0]) throw new HttpError(404, 'Pozícia neexistuje');
  res.json({ job: recordset[0] });
});

module.exports = router;
