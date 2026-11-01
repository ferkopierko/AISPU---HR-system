import { deadlineHint, EMPLOYMENT_LABELS, formatDate, formatDay, formatSalary, WORK_MODE_LABELS } from '../labels';
import { IconCalendar, IconClock, IconHome, IconMapPin, IconWallet } from './Icons';

/** Krátky riadok údajov pozície do zoznamu: lokalita · režim · úväzok. */
export function JobMetaLine({ job }) {
  const items = [
    job.location && [IconMapPin, job.location],
    job.workMode && [IconHome, WORK_MODE_LABELS[job.workMode]],
    job.employmentType && [IconClock, EMPLOYMENT_LABELS[job.employmentType]],
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <span className="meta-line">
      {items.map(([Icon, text]) => (
        <span key={text}><Icon size={14} />{text}</span>
      ))}
    </span>
  );
}

/** Uzávierka s upozornením, ak je do týždňa. */
export function Deadline({ day, prefix = 'Uzávierka' }) {
  if (!day) return null;
  const hint = deadlineHint(day);
  return (
    <span className={`deadline${hint ? ' soon' : ''}`}>
      {prefix} <span className="num">{formatDay(day)}</span>
      {hint && <em>{hint}</em>}
    </span>
  );
}

/** Všetky praktické údaje pozície pod sebou (detail pozície). */
export default function JobFacts({ job }) {
  const salary = formatSalary(job);
  const rows = [
    [IconMapPin, 'Lokalita', job.location],
    [IconHome, 'Režim práce', WORK_MODE_LABELS[job.workMode]],
    [IconClock, 'Úväzok', EMPLOYMENT_LABELS[job.employmentType]],
    [IconWallet, 'Plat', salary],
    [IconCalendar, 'Zverejnené', formatDate(job.publishedAt)],
    [IconCalendar, 'Uzávierka', job.deadline && <Deadline day={job.deadline} prefix="" />],
  ].filter(([, , value]) => value);
  if (!rows.length) return null;
  return (
    <dl className="facts">
      {rows.map(([Icon, label, value]) => (
        <div key={label}>
          <dt><Icon size={14} />{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
