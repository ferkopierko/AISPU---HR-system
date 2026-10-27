// GDPR: vymazanie prihlášok starších ako RETENTION_MONTHS (default 6) od podania.
//
// Beží v Backende 1 raz denne (prvýkrát minútu po štarte). Zmaže prihlášku a kaskádou
// jej CV a poznámky HR v Azure SQL, predtým analýzu CV v MySQL cez Backend 2.
// Ak Backend 2 nie je dostupný, nezmaže sa nič a skúsi sa to znova o deň.
// Účet uchádzača ostáva.

const config = require('../config/env');
const db = require('../db/azureSql');
const { deleteAnalyses } = require('./backend2');

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;

/** Jedno kolo mazania. Vráti počet zmazaných prihlášok. */
async function purgeExpiredApplications() {
  let total = 0;
  for (;;) {
    const { recordset } = await db.query(
      `SELECT TOP (${BATCH}) id FROM dbo.applications
       WHERE created_at < DATEADD(MONTH, -@months, SYSUTCDATETIME())
       ORDER BY id`,
      { months: config.retentionMonths }
    );
    const ids = recordset.map((r) => r.id);
    if (ids.length === 0) return total;

    await deleteAnalyses(ids); // najprv MySQL – pri chybe ostane všetko a skúsi sa znova
    await db.query(
      'DELETE FROM dbo.applications WHERE id IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))',
      { ids: JSON.stringify(ids) }
    );
    total += ids.length;
    if (ids.length < BATCH) return total;
  }
}

async function runOnce() {
  try {
    const deleted = await purgeExpiredApplications();
    if (deleted > 0) {
      console.log(`[retention] zmazaných ${deleted} prihlášok starších ako ${config.retentionMonths} mesiacov`);
    }
  } catch (err) {
    console.error('[retention] mazanie zlyhalo, skúsi sa znova o deň:', err.message);
  }
}

/** Spustí denné mazanie; časovače nebránia vypnutiu procesu. */
function startRetentionJob() {
  setTimeout(runOnce, 60 * 1000).unref();
  setInterval(runOnce, DAY_MS).unref();
}

module.exports = { startRetentionJob, purgeExpiredApplications };
