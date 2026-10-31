// Volania interného API Backendu 2 (MySQL s analýzami CV).

const config = require('../config/env');

/**
 * Zmaže analýzy CV daných prihlášok v Backende 2 (text CV, zručnosti, skóre).
 * Pri chybe vyhodí výnimku – volajúci vtedy nesmie zmazať prihlášky ani v Azure SQL,
 * inak by v MySQL ostali dáta bez prihlášky a už by sa nedali nájsť.
 * @param {number[]} applicationIds
 * @returns {Promise<number>} počet prihlášok, ktoré mali analýzu
 */
async function deleteAnalyses(applicationIds) {
  if (applicationIds.length === 0) return 0;
  if (!config.internalApiKey) throw new Error('INTERNAL_API_KEY nie je nastavený');

  const res = await fetch(`${config.backend2Url}/api/ml/internal/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': config.internalApiKey },
    body: JSON.stringify({ application_ids: applicationIds }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Backend 2 odpovedal ${res.status}`);
  return (await res.json()).deleted;
}

module.exports = { deleteAnalyses };
