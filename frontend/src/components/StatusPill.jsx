import { STATUS_LABELS } from '../labels';

/** Stav prihlášky ako farebný štítok (farby .st-* v styles.css). */
export default function StatusPill({ status }) {
  return <span className={`status-pill st-${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}
