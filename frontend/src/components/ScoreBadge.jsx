import { useEffect, useState } from 'react';

/** Úroveň zhody: dobrá ≥ 70, stredná ≥ 40, inak slabá. */
export function scoreLevel(value) {
  if (value == null) return 'none';
  return value >= 70 ? 'high' : value >= 40 ? 'mid' : 'low';
}

// farby sú v styles.css (--good, --mid, --low)
const COLORS = { high: 'var(--good)', mid: 'var(--mid)', low: 'var(--low)', none: 'var(--line-strong)' };

/** Hodnota sa po zobrazení „naplní“ z nuly (pri prefers-reduced-motion hneď, cez CSS). */
function useFill(value) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(value ?? 0));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

/** Malé percento v tabuľke + pásik. */
export default function ScoreBadge({ value }) {
  const level = scoreLevel(value);
  const fill = useFill(value);
  if (value == null) return <span className="score-none">bez skóre</span>;
  return (
    <span className={`score score-${level}`}>
      <span className="num">{Number(value).toFixed(0)} %</span>
      <span className="bar"><span style={{ width: `${fill}%` }} /></span>
    </span>
  );
}

/** Kruhový ukazovateľ skóre. */
export function ScoreRing({ value, size = 96 }) {
  const level = scoreLevel(value);
  const stroke = Math.max(4, size / 14);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, useFill(value)));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={value == null ? 'Bez skóre' : `Zhoda ${Math.round(value)} %`}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'var(--line)' }} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          style={{ stroke: COLORS[level], transition: 'stroke-dashoffset 1s var(--ease)' }}
        />
      </svg>
      <span style={{ fontSize: size / 3.4 }}>
        {value == null ? '–' : Math.round(value)}
        {value != null && <small>%</small>}
      </span>
    </div>
  );
}
