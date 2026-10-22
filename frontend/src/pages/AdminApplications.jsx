import { Fragment, useEffect, useState } from 'react';
import { admin, ml } from '../api';
import AnalysisDetail from '../components/AnalysisDetail';
import { initials } from '../components/Layout';
import ScoreBadge from '../components/ScoreBadge';

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

  // Načíta všetky prihlášky naraz; filtrovanie prebieha vo frontende, aby štatistiky sedeli.
  useEffect(() => {
    admin
      .applications()
      .then((apps) =>
        Promise.all(apps.map(async (a) => ({ ...a, analysis: await ml.result(a.id).catch(() => null) })))
      )
      .then(setRows)
      .catch((err) => setError(err.message));
  }, []);

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
  const scored = rows.filter((r) => r.analysis);
  const avg = scored.length ? scored.reduce((s, r) => s + Number(r.analysis.score_percentage), 0) / scored.length : null;

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
          <p className="muted" style={{ margin: 0 }}>Kliknutím na riadok zobrazíte detail analýzy CV.</p>
        </div>
      </div>

      <div className="stats">
        <Stat icon="📥" bg="#dbeafe" value={rows.length} label="Prihlášok spolu" />
        <Stat icon="🆕" bg="#fef3c7" value={rows.filter((r) => r.status === 'submitted').length} label="Nových na posúdenie" />
        <Stat icon="🗓️" bg="#eef2ff" value={rows.filter((r) => r.status === 'interview').length} label="Pozvaných na pohovor" />
        <Stat icon="🎯" bg="#dcfce7" value={avg == null ? '–' : `${avg.toFixed(0)} %`} label="Priemerná zhoda" />
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
                    <td><ScoreBadge value={r.analysis?.score_percentage} /></td>
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
                        {r.analysis ? <AnalysisDetail analysis={r.analysis} size={80} /> : <p className="muted">CV ešte nebolo analyzované.</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
