// /api/internal – volania z Backendu 2 (nie z frontendu).
//
// Backend 2 po analýze CV pošle súbor a kontakt vytiahnutý z CV. Preposiela aj
// session cookie uchádzača, takže sa overí, že prihláška patrí prihlásenému
// používateľovi – cudzí nemôže nahrať CV k cudzej prihláške.

const express = require('express');
const db = require('../db/azureSql');
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/validate');
const { requireInternalKey } = require('../middleware/internalAuth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_CV_BYTES = 5 * 1024 * 1024; // rovnaký limit ako v Backende 2
const CV_TYPES = {
  'application/pdf': (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    (buf) => buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
};

// base64 je o tretinu väčší ako súbor
router.use(requireInternalKey, express.json({ limit: '8mb' }));

/** Voliteľný krátky text; prázdny = null, dlhší sa oreže. */
function optionalText(value, max) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, max);
}

// Authorize BEFORE external AI calls; requirements are never accepted from the browser.
router.get('/applications/:id/analysis-context', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  const { recordset } = await db.query(
    `SELECT a.user_id, a.job_id, j.requirements, j.description, j.title
     FROM dbo.applications a JOIN dbo.jobs j ON j.id = a.job_id WHERE a.id = @id`, { id }
  );
  const application = recordset[0];
  if (!application) throw new HttpError(404, 'Prihláška neexistuje');
  if (application.user_id !== req.session.userId && req.session.role !== 'admin') {
    throw new HttpError(403, 'K tejto prihláške nemáte prístup');
  }
  res.set('Cache-Control', 'private, no-store');
  res.json({ applicationId: id, jobId: application.job_id,
    requirements: application.requirements || application.description || application.title });
});

// PUT /api/internal/applications/:id/cv
//   { filename, contentType, data (base64), candidateName?, candidatePhone? }
router.put('/applications/:id/cv', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  const { filename, contentType, data } = req.body ?? {};

  if (!CV_TYPES[contentType]) throw new HttpError(400, 'CV musí byť PDF alebo DOCX');
  if (typeof filename !== 'string' || !filename.trim()) throw new HttpError(400, 'Chýba názov súboru');
  if (typeof data !== 'string' || !data) throw new HttpError(400, 'Chýba obsah súboru');
  const file = Buffer.from(data, 'base64');
  if (file.length === 0 || file.length > MAX_CV_BYTES) throw new HttpError(400, 'Neplatná veľkosť súboru');
  if (!CV_TYPES[contentType](file)) throw new HttpError(400, 'Obsah súboru nezodpovedá typu');

  const { recordset } = await db.query(
    'SELECT user_id, status FROM dbo.applications WHERE id = @id',
    { id }
  );
  if (!recordset[0]) throw new HttpError(404, 'Prihláška neexistuje');
  if (recordset[0].user_id !== req.session.userId) {
    throw new HttpError(403, 'Prihláška nepatrí prihlásenému používateľovi');
  }
  if (recordset[0].status === 'withdrawn') throw new HttpError(409, 'Prihláška bola stiahnutá');

  // A retry must keep the same CV as the queued text, including concurrent submissions.
  const saved = await db.query(
    `MERGE dbo.application_cvs WITH (HOLDLOCK) AS t
     USING (SELECT @id AS application_id) AS s ON t.application_id = s.application_id
     WHEN NOT MATCHED THEN INSERT (application_id, filename, content_type, size_bytes, data)
          VALUES (@id, @filename, @contentType, @size, @file);
     SELECT CASE WHEN data=@file THEN 1 ELSE 0 END AS same_cv FROM dbo.application_cvs WHERE application_id=@id;`,
    {
      id,
      name: optionalText(req.body.candidateName, 200),
      phone: optionalText(req.body.candidatePhone, 50),
      filename: filename.trim().slice(0, 255),
      contentType,
      size: file.length,
      file,
    }
  );
  if (saved.recordset[0]?.same_cv !== 1) throw new HttpError(409, 'K prihláške už je uložený iný životopis. Opakujte analýzu pôvodného CV.');
  await db.query('UPDATE dbo.applications SET candidate_name=@name, candidate_phone=@phone WHERE id=@id', {
    id, name: optionalText(req.body.candidateName, 200), phone: optionalText(req.body.candidatePhone, 50),
  });
  res.status(204).end();
});

module.exports = router;
