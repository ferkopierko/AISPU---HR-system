/** Úroveň zhody: zelená ≥ 70, oranžová ≥ 40, inak červená. */
export function scoreLevel(value) {
  if (value == null) return 'none';
  return value >= 70 ? 'high' : value >= 40 ? 'mid' : 'low';
}

const COLORS = { high: '#16a34a', mid: '#d97706', low: '#dc2626', none: '#cbd5e1' };

/** Malé percento v tabuľke + pásik. */
export default function ScoreBadge({ value }) {
  const level = scoreLevel(value);
  if (value == null) return <span className="score-none">nehodnotené</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
      <span className={`score-pill score-${level}`}>{Number(value).toFixed(0)} %</span>
      <span className="bar"><div style={{ width: `${value}%`, background: COLORS[level] }} /></span>
    </span>
  );
}

/** Kruhový ukazovateľ skóre. */
export function ScoreRing({ value, size = 96 }) {
  const level = scoreLevel(value);
  const stroke = size / 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f5" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={COLORS[level]} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <span style={{ fontSize: size / 4.2, color: COLORS[level] }}>{value == null ? '–' : `${Math.round(pct)}%`}</span>
    </div>
  );
}
