import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { applications, ml } from '../api';
import Department from '../components/Department';
import ListSkeleton from '../components/ListSkeleton';
import { IconAlert, IconArrowRight, IconCheck, IconInbox } from '../components/Icons';
import ScoreBadge from '../components/ScoreBadge';
import StatusPill from '../components/StatusPill';
import { formatDate } from '../labels';

// Stiahnutú ani zamietnutú prihlášku Backend 1 stiahnuť nedovolí (409).
const canWithdraw = (a) => !['withdrawn', 'rejected'].includes(a.status);

// Moje prihlášky – zoznam z Backendu 1, zhoda každej prihlášky z Backendu 2.
export default function MyApplications() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmId, setConfirmId] = useState(null); // prihláška, pri ktorej sa pýtame na potvrdenie
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState(null); // { id, message }

  useEffect(() => {
    let cancelled = false;
    applications
      .mine()
      .then((apps) => Promise.all(apps.map(async (a) => ({ ...a, analysis: await ml.result(a.id).catch(() => null) }))))
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  async function withdraw(a) {
    setBusyId(a.id);
    setRowError(null);
    try {
      const { status } = await applications.withdraw(a.id);
      // analýzu Backend 2 zmazal, zhoda sa už nezobrazuje
      setRows((prev) => prev.map((r) => (r.id === a.id ? { ...r, status, analysis: null } : r)));
      setConfirmId(null);
      setNotice(`Prihláška na pozíciu „${a.job.title}“ je stiahnutá. CV a jeho vyhodnotenie sme vymazali.`);
    } catch (err) {
      setRowError({ id: a.id, message: err.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <span className="eyebrow">Uchádzač</span>
          <h1>Moje prihlášky</h1>
          <p className="muted">Stav mení HR počas výberu. Zhoda ukazuje, koľko požiadaviek pozície sa našlo vo vašom CV.</p>
        </div>
      </header>

      {notice && <p className="success notice" role="status"><IconCheck size={16} />{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!rows && !error && <ListSkeleton />}

      {rows?.length === 0 && (
        <div className="empty">
          <IconInbox size={32} />
          <strong>Zatiaľ ste sa neprihlásili na žiadnu pozíciu</strong>
          <p>Vyberte si pozíciu, nahrajte CV a prihláška sa tu objaví aj s vyhodnotením.</p>
          <Link to="/jobs" className="btn secondary btn-sm">Prezrieť pozície</Link>
        </div>
      )}

      {rows?.length > 0 && (
        <ul className="row-list my-list">
          {rows.map((a) => {
            const open = a.job.status === 'open';
            return (
              <li key={a.id} className="my-row">
                <div className="my-job">
                  {open ? (
                    <Link to={`/jobs/${a.job.id}`} className="row-title">{a.job.title}</Link>
                  ) : (
                    <span className="row-title">{a.job.title}</span>
                  )}
                  <span className="row-meta">
                    <Department name={a.job.department} />
                    <span className="num">Podané {formatDate(a.createdAt)}</span>
                    {!open && <span>pozícia je uzavretá</span>}
                  </span>
                </div>
                <div className="my-score">
                  <span className="row-label">Zhoda</span>
                  <ScoreBadge value={a.analysis?.score_percentage} />
                </div>
                <div className="my-status">
                  <span className="row-label">Stav</span>
                  <StatusPill status={a.status} />
                </div>
                <div className="my-actions">
                  {canWithdraw(a) && confirmId !== a.id && (
                    <button type="button" className="ghost" onClick={() => { setConfirmId(a.id); setRowError(null); }}>
                      Stiahnuť
                      <span className="visually-hidden"> prihlášku na pozíciu {a.job.title}</span>
                    </button>
                  )}
                  {open && (
                    <Link to={`/jobs/${a.job.id}`} className="row-arrow" aria-label={`Detail pozície ${a.job.title}`}>
                      <IconArrowRight />
                    </Link>
                  )}
                </div>
                {confirmId === a.id && (
                  <div className="withdraw-confirm" role="group" aria-labelledby={`withdraw-${a.id}`}>
                    <p id={`withdraw-${a.id}`}>
                      <strong>Naozaj stiahnuť prihlášku na pozíciu {a.job.title}?</strong>
                      Vaše CV aj jeho vyhodnotenie sa vymažú. Na túto pozíciu sa potom už nebudete môcť prihlásiť znova.
                    </p>
                    {rowError?.id === a.id && <p className="error" role="alert"><IconAlert size={16} />{rowError.message}</p>}
                    <div className="form-actions">
                      <button type="button" className="danger btn-sm" disabled={busyId === a.id} onClick={() => withdraw(a)} autoFocus>
                        {busyId === a.id && <span className="spinner" />}
                        {busyId === a.id ? 'Sťahujem…' : 'Áno, stiahnuť prihlášku'}
                      </button>
                      <button type="button" className="secondary btn-sm" disabled={busyId === a.id} onClick={() => setConfirmId(null)}>
                        Ponechať
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
