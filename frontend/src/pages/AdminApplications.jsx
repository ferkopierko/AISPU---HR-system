import { Fragment, lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { admin, ml } from '../api';
import AnalysisDetail from '../components/AnalysisDetail';
import {
  IconAlert, IconBell, IconCalendar, IconChevronDown, IconDownload, IconExternal, IconEye, IconGauge, IconInbox, IconMail, IconPhone,
} from '../components/Icons';
import { initials } from '../components/Layout';
import ListSkeleton from '../components/ListSkeleton';
import NotesPanel from '../components/NotesPanel';
import ScoreBadge from '../components/ScoreBadge';
import StatusPill from '../components/StatusPill';
import { formatDate, STATUS_LABELS } from '../labels';
const OriginalCvDialog = lazy(() => import('../components/OriginalCvDialog'));

// Obrazovka 2 – HR dashboard. Zoznam prihlášok je z Backendu 1,
// skóre zhody každej prihlášky z Backendu 2.

const SETTABLE = ['reviewing', 'interview', 'accepted', 'rejected'];
const AI_STATE_LABELS = { queued: 'Čaká na analýzu', processing: 'Spracúva sa', failed: 'Chyba analýzy', not_started: 'CV ešte nenahrané' };
const PROVIDER_LABELS = { azure_llm: 'Azure LLM', azure_custom_ner: 'Azure Custom NER' };

export default function AdminApplications() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [jobFilter, setJobFilter] = useState(searchParams.get('jobId') ?? ''); // zo Správy pozícií (?jobId=)
  const [sortByScore, setSortByScore] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [retrying, setRetrying] = useState(null);
  const [previewCv, setPreviewCv] = useState(null);

  // Všetky pozície do filtra (aj tie bez prihlášok) – raz pri otvorení stránky.
  useEffect(() => {
    admin.jobs().then(setJobs).catch((err) => setError(err.message));
  }, []);

  // Načíta všetky prihlášky naraz a každých 5 s obnoví stav analýz;
  // filtrovanie prebieha vo frontende, aby štatistiky sedeli.
  useEffect(() => {
    let cancelled = false, timer;
    async function load() {
      try {
        const apps = await admin.applications();
        const next = await Promise.all(apps.map(async (a) => {
          const task = await ml.status(a.id);
          return { ...a, task, analysis: task.state === 'completed' ? await ml.result(a.id) : null };
        }));
        if (!cancelled) { setRows(next); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) timer = setTimeout(load, 5000);
      }
    }
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refresh]);

  async function retry(id) {
    setRetrying(id);
    try { await ml.retry(id); setRefresh((n) => n + 1); } catch (err) { setError(err.message); } finally { setRetrying(null); }
  }

  async function changeStatus(id, status) {
    try {
      await admin.setStatus(id, status);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !rows) return <p className="error" role="alert"><IconAlert size={16} />{error}</p>;

  const scored = (rows ?? []).filter((r) => r.analysis && r.analysis.score_percentage != null);
  let visible = rows ?? [];
  if (jobFilter) visible = visible.filter((r) => String(r.job.id) === jobFilter);
  if (statusFilter) visible = visible.filter((r) => r.status === statusFilter);
  if (sortByScore) {
    visible = [...visible].sort((a, b) => (b.analysis?.score_percentage ?? -1) - (a.analysis?.score_percentage ?? -1));
  }

  return (
    <>
      <header className="page-head">
        <div>
          <span className="eyebrow">HR</span>
          <h1>Prihlášky uchádzačov</h1>
          <p className="muted">Riadok rozbalíte kliknutím. Uvidíte kontakt, CV, poznámky a výsledok analýzy.</p>
        </div>
      </header>

      <dl className="stats">
        <Stat icon={IconInbox} value={rows?.length} label="prihlášok spolu" />
        <Stat icon={IconBell} value={rows?.filter((r) => r.status === 'submitted').length} label="nových na posúdenie" />
        <Stat icon={IconCalendar} value={rows?.filter((r) => r.status === 'interview').length} label="pozvaných na pohovor" />
        <Stat icon={IconGauge} value={rows && scored.length} label="analýz so skóre" />
      </dl>

      <div className="toolbar">
        <label className="inline-field">
          <span className="visually-hidden">Pozícia</span>
          <select id="filter-job" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
            <option value="">Všetky pozície</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}{j.status !== 'open' ? ` (${j.status === 'draft' ? 'koncept' : 'uzavretá'})` : ''}</option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <span className="visually-hidden">Stav</span>
          <select id="filter-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Všetky stavy</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="checkbox">
          <input id="filter-sort" type="checkbox" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} />
          Zoradiť podľa zhody
        </label>
      </div>
      {error && <p className="error" role="alert"><IconAlert size={16} />{error}</p>}
      <p className="muted ai-notice">Skóre porovnávajte v rámci rovnakej pozície a rovnakých požiadaviek. Staršie výsledky môžu používať pôvodný výpočet 60/40. O prijatí rozhoduje HR, nie model.</p>

      {!rows && <ListSkeleton rows={4} />}
      {rows && visible.length === 0 && (
        <div className="empty">
          <IconInbox size={32} />
          <strong>{rows.length ? 'Žiadna prihláška nezodpovedá filtru' : 'Zatiaľ neprišla žiadna prihláška'}</strong>
          <p>{rows.length ? 'Zmeňte pozíciu alebo stav vo filtri.' : 'Prihlášky sa tu objavia hneď, ako ich uchádzači odošlú.'}</p>
        </div>
      )}
      {visible.length > 0 && (
        <div className="table-scroll">
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
              {visible.map((r) => {
                const open = openId === r.id;
                const toggle = () => setOpenId(open ? null : r.id);
                return (
                  <Fragment key={r.id}>
                    <tr className={`clickable${open ? ' is-open' : ''}`} onClick={toggle}>
                      <td>
                        <div className="who">
                          <span className="avatar" aria-hidden="true">{initials(r.candidate.name || r.candidate.email)}</span>
                          <span>
                            <button
                              type="button" className="link-button cell-title" aria-expanded={open} aria-controls={`app-${r.id}`}
                              onClick={(e) => { e.stopPropagation(); toggle(); }}
                            >
                              {r.candidate.name || r.candidate.email}
                              <IconChevronDown size={14} className="chevron" />
                            </button>
                            {r.candidate.name && <span className="cell-sub">{r.candidate.email}</span>}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="cell-title">{r.job.title}</span>
                        <span className="cell-sub">{r.job.department}</span>
                      </td>
                      <td className="hide-sm num">{formatDate(r.createdAt)}</td>
                      <td>
                        {r.status === 'withdrawn' ? (
                          // analýzu Backend 2 pri stiahnutí zmazal – žiadne „bez skóre / CV nenahrané“
                          <span className="muted" aria-label="Bez skóre, prihláška je stiahnutá">—</span>
                        ) : (
                          <>
                            <ScoreBadge value={r.analysis?.score_percentage} />
                            <small className="ai-state-label">
                              {r.task?.state === 'completed' ? PROVIDER_LABELS[r.analysis?.provider] ?? 'Lokálna analýza' : AI_STATE_LABELS[r.task?.state]}
                            </small>
                          </>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.status === 'withdrawn' ? (
                          <StatusPill status="withdrawn" />
                        ) : (
                          <select
                            className={`status-select st-${r.status}`} value={r.status} aria-label={`Stav prihlášky – ${r.candidate.name || r.candidate.email}`}
                            onChange={(e) => changeStatus(r.id, e.target.value)}
                          >
                            {r.status === 'submitted' && <option value="submitted">{STATUS_LABELS.submitted}</option>}
                            {SETTABLE.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="expand" id={`app-${r.id}`}>
                        <td colSpan={5}>
                          {r.status === 'withdrawn' && (
                            <p className="withdrawn-note">
                              <strong>Uchádzač prihlášku stiahol</strong>
                              CV, kontakt z CV a výsledok analýzy sa pri stiahnutí vymazali. Stav prihlášky sa už nedá meniť.
                            </p>
                          )}
                          <div className="app-detail">
                            <div className="app-side">
                              <section aria-label="Kontakt">
                                <h3>Kontakt</h3>
                                <ul className="contact">
                                  <li><IconMail size={14} /><a href={`mailto:${r.candidate.email}`}>{r.candidate.email}</a></li>
                                  <li><IconPhone size={14} />{r.candidate.phone ? <a href={`tel:${r.candidate.phone.replace(/[^\d+]/g, '')}`}>{r.candidate.phone}</a> : <span className="muted">telefón neuvedený</span>}</li>
                                </ul>
                              </section>
                              <section aria-label="Životopis">
                                <h3>Životopis</h3>
                                {r.status === 'withdrawn' ? (
                                  <p className="muted">Vymazaný pri stiahnutí prihlášky.</p>
                                ) : r.hasCv ? (
                                  <div className="cv-actions">
                                    <a className="btn secondary btn-sm" href={admin.cvUrl(r.id)} target="_blank" rel="noopener noreferrer">
                                      <IconExternal size={14} /> Zobraziť CV
                                    </a>
                                    <a className="btn secondary btn-sm" href={admin.cvUrl(r.id, { download: true })}>
                                      <IconDownload size={14} /> Stiahnuť CV
                                    </a>
                                    <button type="button" className="ghost" onClick={() => setPreviewCv(r)}>
                                      <IconEye size={14} /> Náhľad tu
                                    </button>
                                  </div>
                                ) : (
                                  <p className="muted">K prihláške zatiaľ nie je uložené CV.</p>
                                )}
                              </section>
                              <NotesPanel applicationId={r.id} />
                            </div>
                            <section className="app-analysis" aria-label="Výsledok analýzy">
                              <h3>Analýza CV</h3>
                              {r.status === 'withdrawn' ? (
                                <p className="muted">Vymazaná pri stiahnutí prihlášky.</p>
                              ) : r.analysis ? (
                                <AnalysisDetail analysis={r.analysis} size={80} forHr />
                              ) : (
                                <p className="muted">{r.task?.error_message || 'Výsledok zatiaľ nie je k dispozícii. Prihláška zostáva uložená.'}</p>
                              )}
                              {r.task?.state === 'failed' && (
                                <button disabled={retrying === r.id} onClick={() => retry(r.id)}>Zopakovať analýzu uloženého CV</button>
                              )}
                            </section>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {previewCv && (
        <Suspense fallback={<p role="status">Načítavam náhľad CV…</p>}>
          <OriginalCvDialog application={previewCv} onClose={() => setPreviewCv(null)} />
        </Suspense>
      )}
    </>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="stat">
      <dt><Icon size={16} />{label}</dt>
      <dd className="num">{value ?? <span className="skeleton" style={{ width: 32, height: 28 }} />}</dd>
    </div>
  );
}
