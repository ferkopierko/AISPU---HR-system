const express = require('express');
const { randomUUID } = require('node:crypto');
const db = require('../db/azureSql');
const config = require('../config/env');
const { requireRole } = require('../middleware/auth');
const { parseId } = require('../utils/validate');
const HttpError = require('../utils/httpError');
const router = express.Router();
router.use(requireRole('admin'));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

async function internal(path, body) {
  if (!config.internalApiKey) throw new HttpError(503, 'Interné API nie je nakonfigurované');
  let response;
  try {
    response = await fetch(`${config.backend2Url}/api/ml/internal/review-summary/${path}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(85000),
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': config.internalApiKey }, body: JSON.stringify(body),
    });
  } catch { throw new HttpError(502, 'Služba AI zhrnutia je dočasne nedostupná.'); }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404) throw new HttpError(404, 'Najprv musí byť dokončená analýza CV.');
    if (response.status === 409) throw new HttpError(409, 'Analýza alebo požiadavky pozície sa zmenili. Obnovte prihlášku a overte aktuálnosť analýzy.');
    throw new HttpError(502, 'AI zhrnutie sa nepodarilo vytvoriť. Skúste neskôr.');
  }
  return result;
}

async function source(id) {
  const { recordset } = await db.query(`SELECT a.status,j.title,j.requirements,j.description,j.responsibilities FROM dbo.applications a
    JOIN dbo.jobs j ON j.id=a.job_id WHERE a.id=@id`, { id });
  if (!recordset[0] || recordset[0].status === 'withdrawn') throw new HttpError(404, 'Prihláška nie je dostupná.');
  const body = { application_id: id, title: recordset[0].title,
    description: recordset[0].description ?? '', responsibilities: recordset[0].responsibilities ?? '',
    requirements: recordset[0].requirements || recordset[0].description || recordset[0].title };
  const { fingerprint, summary } = await internal('context', body);
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new HttpError(502, 'Neplatný podklad pre zhrnutie.');
  return { ...body, fingerprint, summary };
}
const publicRow = (row) => ({ state: row?.state ?? 'missing', summary: row?.state === 'ready' ? JSON.parse(row.payload_json) : null });

router.get('/:id/summary', async (req, res) => {
  const id = parseId(req.params.id);
  const context = await source(id);
  if (context.summary) return res.json({ state: 'ready', summary: context.summary });
  const { recordset } = await db.query(`SELECT CASE WHEN state=N'processing' AND lease_until<SYSUTCDATETIME()
    THEN N'failed' ELSE state END AS state,payload_json FROM dbo.application_review_summaries
    WHERE application_id=@id AND fingerprint=@fingerprint`, { id, fingerprint: context.fingerprint });
  res.json(publicRow(recordset[0]));
});

router.post('/:id/summary', async (req, res) => {
  const id = parseId(req.params.id);
  const context = await source(id);
  if (context.summary) return res.json({ state: 'ready', summary: context.summary });
  const token = randomUUID();
  // A short DB transaction claims work; no locks are held during the model call.
  const { recordset } = await db.query(`SET XACT_ABORT ON;
    BEGIN TRY
      BEGIN TRANSACTION;
      IF NOT EXISTS (SELECT 1 FROM dbo.applications WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND status<>N'withdrawn')
        THROW 51001,'Prihláška nie je dostupná.',1;
      DECLARE @state nvarchar(20), @existing char(64), @lease datetime2;
      SELECT @state=state,@existing=fingerprint,@lease=lease_until FROM dbo.application_review_summaries
        WITH (UPDLOCK,HOLDLOCK) WHERE application_id=@id;
      DECLARE @claimed bit=0;
      IF @state IS NULL
      BEGIN
        INSERT INTO dbo.application_review_summaries(application_id,fingerprint,state,lock_token,lease_until)
          VALUES(@id,@fingerprint,N'processing',@token,DATEADD(MINUTE,5,SYSUTCDATETIME()));
        SET @claimed=1;
      END
      ELSE IF NOT (@state=N'ready' AND @existing=@fingerprint) AND NOT (@state=N'processing' AND @lease>SYSUTCDATETIME())
      BEGIN
        UPDATE dbo.application_review_summaries SET state=N'processing',fingerprint=@fingerprint,payload_json=NULL,
          lock_token=@token,lease_until=DATEADD(MINUTE,5,SYSUTCDATETIME()) WHERE application_id=@id;
        SET @claimed=1;
      END;
      COMMIT;
      SELECT state,payload_json,@claimed AS claimed FROM dbo.application_review_summaries WHERE application_id=@id;
    END TRY
    BEGIN CATCH
      IF @@TRANCOUNT>0 ROLLBACK;
      THROW;
    END CATCH;`, { id, fingerprint: context.fingerprint, token }).catch((err) => {
      if (err.number === 51001) throw new HttpError(404, 'Prihláška nie je dostupná.');
      throw err;
    });
  if (!recordset[0]) throw new HttpError(409, 'Prihláška sa medzičasom zmenila.');
  if (!recordset[0].claimed) return res.status(recordset[0].state === 'processing' ? 202 : 200).json(publicRow(recordset[0]));
  try {
    const { summary: ignored, ...generationContext } = context;
    const summary = await internal('generate', generationContext);
    if (summary.fingerprint !== context.fingerprint || !Array.isArray(summary.lines) || summary.lines.length !== 4 || summary.lines.some((line) => typeof line !== 'string' || line.length > 400)) {
      throw new HttpError(502, 'AI zhrnutie nemá očakávaný formát.');
    }
    const saved = await db.query(`UPDATE s SET state=N'ready',payload_json=@payload,lock_token=NULL,lease_until=NULL
      FROM dbo.application_review_summaries s JOIN dbo.applications a ON a.id=s.application_id
      WHERE s.application_id=@id AND s.lock_token=@token AND a.status<>N'withdrawn';`,
    { id, token, payload: JSON.stringify(summary) });
    if (saved.rowsAffected[0] !== 1) throw new HttpError(409, 'Prihláška sa medzičasom zmenila.');
    res.json({ state: 'ready', summary });
  } catch (err) {
    await db.query(`UPDATE dbo.application_review_summaries SET state=N'failed',lock_token=NULL,lease_until=NULL
      WHERE application_id=@id AND lock_token=@token`, { id, token });
    throw err;
  }
});
module.exports = router;
