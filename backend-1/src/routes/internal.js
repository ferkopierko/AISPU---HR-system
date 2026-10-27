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

  // opakovaná analýza nahradí CV aj kontakt
  await db.query(
    `UPDATE dbo.applications SET candidate_name = @name, candidate_phone = @phone WHERE id = @id;
     MERGE dbo.application_cvs AS t
     USING (SELECT @id AS application_id) AS s ON t.application_id = s.application_id
     WHEN MATCHED THEN UPDATE SET filename = @filename, content_type = @contentType,
          size_bytes = @size, data = @file, uploaded_at = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (application_id, filename, content_type, size_bytes, data)
          VALUES (@id, @filename, @contentType, @size, @file);`,
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
  res.status(204).end();
});

module.exports = router;
