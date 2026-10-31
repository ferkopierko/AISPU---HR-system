import { Fragment, lazy, Suspense, useEffect, useState } from 'react';
import { admin, ml } from '../api';
import AnalysisDetail from '../components/AnalysisDetail';
import { initials } from '../components/Layout';
import ScoreBadge from '../components/ScoreBadge';
const OriginalCvDialog = lazy(() => import('../components/OriginalCvDialog'));

// Obrazovka 2 – HR dashboard. Zoznam prihlášok je z Backendu 1,
// skóre zhody každej prihlášky z Backendu 2.

const STATUS_LABELS = {
  submitted: 'Nová',
  reviewing: 'Posudzuje sa',
  interview: 'Pohovor',
  accepted: 'Prijatý',
  rejected: 'Zamietnutý',
};
const SETTABLE = ['reviewing', 'interview', 'accepted', 'rejected'];

export default function AdminApplications() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [sortByScore, setSortByScore] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [retrying, setRetrying] = useState(null);
  const [previewCv, setPreviewCv] = useState(null);

  // Načíta všetky prihlášky naraz; filtrovanie prebieha vo frontende, aby štatistiky sedeli.
  useEffect(() => {
    let cancelled=false, timer;
    async function load(){try{
      const apps=await admin.applications();
      const next=await Promise.all(apps.map(async a=>{const task=await ml.status(a.id);return {...a,task,analysis:task.state==='completed'?await ml.result(a.id):null}}));
      if(!cancelled){setRows(next);setError('')}
    }catch(err){if(!cancelled)setError(err.message)}finally{if(!cancelled)timer=setTimeout(load,5000)}}
    load();return()=>{cancelled=true;clearTimeout(timer)};
  }, [refresh]);

  async function retry(id){setRetrying(id);try{await ml.retry(id);setRefresh(n=>n+1)}catch(err){setError(err.message)}finally{setRetrying(null)}}

  async function changeStatus(id, status) {
    try {
      await admin.setStatus(id, status);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !rows) return <p className="error">{error}</p>;
  if (!rows) return <div className="loading"><span className="spinner dark" /> Načítavam prihlášky…</div>;

  const jobsInList = [...new Map(rows.map((r) => [r.job.id, r.job])).values()];
  const scored = rows.filter((r) => r.analysis && r.analysis.score_percentage != null);

  let visible = rows;
  if (jobFilter) visible = visible.filter((r) => String(r.job.id) === jobFilter);
  if (statusFilter) visible = visible.filter((r) => r.status === statusFilter);
  if (sortByScore) {
    visible = [...visible].sort((a, b) => (b.analysis?.score_percentage ?? -1) - (a.analysis?.score_percentage ?? -1));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prihlášky uchádzačov</h1>
          <p className="muted" style={{ margin: 0 }}>Kliknutím na riadok zobrazíte originálne CV aj výsledky analýzy.</p>
        </div>
      </div>

      <div className="stats">
        <Stat icon="📥" bg="#dbeafe" value={rows.length} label="Prihlášok spolu" />
        <Stat icon="🆕" bg="#fef3c7" value={rows.filter((r) => r.status === 'submitted').length} label="Nových na posúdenie" />
        <Stat icon="🗓️" bg="#eef2ff" value={rows.filter((r) => r.status === 'interview').length} label="Pozvaných na pohovor" />
        <Stat icon="🎯" bg="#dcfce7" value={scored.length} label="Analýz so skóre" />
      </div>

      <div className="toolbar">
        <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
          <option value="">Všetky pozície</option>
          {jobsInList.map((j) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Všetky stavy</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="checkbox" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} style={{ marginTop: 0 }} />
          Zoradiť podľa zhody
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted ai-notice">Skóre porovnávajte v rámci rovnakej pozície a rovnakých požiadaviek. Staršie výsledky môžu používať pôvodný výpočet 60/40. O prijatí rozhoduje HR, nie model.</p>

      {visible.length === 0 ? (
        <div className="card empty">
          <div className="icon">📭</div>
          <p>Žiadne prihlášky.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Uchádzač</th>
                <th>Pozícia</th>
                <th className="hide-sm">Podané</th>
                <th>Zhoda</th>
                <th>Stav</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <Fragment key={r.id}>
                  <tr className="clickable" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    <td>
                      <div className="who">
                        <span className="avatar">{initials(r.candidate.email)}</span>
                        {r.candidate.email}
                      </div>
                    </td>
                    <td>
                      {r.job.title}
                      <div className="muted" style={{ fontSize: '0.8rem' }}>{r.job.department}</div>
                    </td>
                    <td className="hide-sm">{new Date(r.createdAt).toLocaleDateString('sk-SK')}</td>
                    <td><ScoreBadge value={r.analysis?.score_percentage} /><small className="ai-state-label">{({queued:'Čaká na analýzu',processing:'Spracúva sa',failed:'Chyba analýzy',not_started:'CV ešte nenahrané',completed:r.analysis?.provider==='azure_llm'?'Azure LLM':r.analysis?.provider==='azure_custom_ner'?'Azure Custom NER':'Lokálna analýza'})[r.task?.state]}</small></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={`status-select st-${r.status}`} value={r.status}
                        onChange={(e) => changeStatus(r.id, e.target.value)}
                      >
                        {r.status === 'submitted' && <option value="submitted">{STATUS_LABELS.submitted}</option>}
                        {SETTABLE.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr className="expand">
                      <td colSpan={5}>
                        <section className="cv-original" aria-label="Originálny životopis">
                          <div>
                            <strong>Originálny životopis</strong>
                            <p className="muted">{r.hasCv ? 'Pôvodný dokument nahraný k tejto prihláške. PDF si môžete prezrieť priamo tu.' : 'K tejto prihláške zatiaľ nie je uložený dokument.'}</p>
                          </div>
                          {r.hasCv && <div className="cv-original-actions">
                            <button className="secondary" onClick={() => setPreviewCv(r)}>Otvoriť originálne CV ↗</button>
                            <a className="btn secondary" href={`/api/admin/applications/${r.id}/cv?download=1`}>Stiahnuť CV ↓</a>
                          </div>}
                        </section>
                        {r.analysis ? <AnalysisDetail analysis={r.analysis} size={80} /> : <p className="muted">{r.task?.error_message || 'Výsledok zatiaľ nie je k dispozícii. Prihláška zostáva uložená.'}</p>}
                        {r.task?.state==='failed'&&<button disabled={retrying===r.id} onClick={()=>retry(r.id)}>Zopakovať analýzu uloženého CV</button>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {previewCv && <Suspense fallback={<p role="status">Načítavam náhľad CV…</p>}><OriginalCvDialog application={previewCv} onClose={() => setPreviewCv(null)}/></Suspense>}
    </>
  );
}

function Stat({ icon, bg, value, label }) {
  return (
    <div className="card stat">
      <span className="stat-icon" style={{ background: bg }}>{icon}</span>
      <div>
        <b>{value}</b>
        <span>{label}</span>
      </div>
    </div>
  );
}
