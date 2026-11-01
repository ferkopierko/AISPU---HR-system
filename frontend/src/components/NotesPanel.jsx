import { useEffect, useState } from 'react';
import { admin } from '../api';
import { formatDateTime } from '../labels';
import { IconAlert, IconMessage } from './Icons';

const MAX = 2000;

/** Interné poznámky HR k prihláške – zoznam (najstaršie hore) a pridanie novej. */
export default function NotesPanel({ applicationId }) {
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    admin.notes(applicationId)
      .then((n) => { if (!cancelled) setNotes(n); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [applicationId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const note = await admin.addNote(applicationId, text);
      setNotes((prev) => [...(prev ?? []), note]);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="notes" aria-label="Poznámky HR">
      <h3>Poznámky HR {notes?.length > 0 && <span className="num muted">{notes.length}</span>}</h3>
      {!notes && !error && <span className="skeleton" style={{ width: '70%', height: 14 }} />}
      {notes?.length === 0 && (
        <p className="muted notes-empty"><IconMessage size={14} />Zatiaľ bez poznámok. Uchádzač ich nevidí.</p>
      )}
      {notes?.length > 0 && (
        <ol className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <p className="pre">{n.text}</p>
              <span className="note-meta">
                {n.author.email ?? 'neznámy autor'} · <span className="num">{formatDateTime(n.createdAt)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <form className="note-form" onSubmit={handleSubmit}>
        <label>
          <span className="visually-hidden">Nová poznámka</span>
          <textarea
            id={`note-${applicationId}`} rows={2} value={text} maxLength={MAX}
            onChange={(e) => setText(e.target.value)} placeholder="Napr. dohodnutý pohovor v utorok o 10:00"
          />
        </label>
        {error && <p className="error" role="alert"><IconAlert size={16} />{error}</p>}
        <div className="note-actions">
          <button type="submit" className="btn-sm" disabled={busy || !text.trim()}>
            {busy && <span className="spinner" />}Pridať poznámku
          </button>
          {text.length > MAX - 200 && <span className="muted num">{text.length} / {MAX}</span>}
        </div>
      </form>
    </section>
  );
}
