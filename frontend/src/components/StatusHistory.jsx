import { useEffect, useState } from 'react';
import { formatDateTime } from '../labels';
import { IconAlert } from './Icons';
import StatusPill from './StatusPill';

/**
 * História stavu prihlášky – najstaršie hore.
 * load = admin.history (s HR, ktorý stav zmenil) alebo applications.history (pre uchádzača).
 */
export default function StatusHistory({ applicationId, load }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    load(applicationId)
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [applicationId, load]);

  return (
    <section className="status-history" aria-label="História stavu">
      <h3>História stavu</h3>
      {error && <p className="error" role="alert"><IconAlert size={16} />{error}</p>}
      {!history && !error && <span className="skeleton" style={{ width: '60%', height: 14 }} />}
      {history?.length === 0 && <p className="muted">Bez záznamov.</p>}
      {history?.length > 0 && (
        <ol className="history-list">
          {history.map((h, i) => (
            <li key={h.id ?? i}>
              <StatusPill status={h.status} />
              <span className="note-meta">
                <span className="num">{h.changedAt ? formatDateTime(h.changedAt) : 'čas zmeny neznámy'}</span>
                {h.changedBy && <> · {h.changedBy.email ?? 'neznámy používateľ'}</>}
                {h.changedBy === null && (h.status === 'submitted' || h.status === 'withdrawn') && <> · uchádzač</>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
