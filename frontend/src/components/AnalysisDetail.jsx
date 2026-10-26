import { ScoreRing } from './ScoreBadge';

const DEGREES = { phd: 'PhD.', master: 'magisterské', bachelor: 'bakalárske', 'high school': 'stredoškolské' };

/** Výsledok analýzy CV z Backendu 2. */
export default function AnalysisDetail({ analysis, size = 96 }) {
  const { score_percentage, skill_coverage, text_similarity, matched_skills, missing_skills, education, experience_years } = analysis;
  const degree = education?.degrees?.[0];
  return (
    <div className="analysis">
      <div className="analysis-head">
        <ScoreRing value={score_percentage} size={size} />
        <div className="metrics">
          <div><span>Pokrytie zručností</span>{fmt(skill_coverage)}</div>
          <div><span>Podobnosť textu</span>{fmt(text_similarity)}</div>
          <div><span>Prax</span>{experience_years ? `${experience_years} r.` : 'neuvedená'}</div>
          <div><span>Vzdelanie</span>{degree ? DEGREES[degree] ?? degree : 'neuvedené'}</div>
        </div>
      </div>
      <SkillList label="Spĺňa" skills={matched_skills} kind="ok" />
      <SkillList label="Chýba" skills={missing_skills} kind="missing" />
    </div>
  );
}

function SkillList({ label, skills, kind }) {
  if (!skills?.length) return null;
  return (
    <p className="skills">
      <strong>{label}</strong>
      {skills.map((s) => (
        <span key={s} className={`chip chip-${kind}`}>{kind === 'ok' ? '✓' : '✕'} {s}</span>
      ))}
    </p>
  );
}

const fmt = (v) => (v == null ? '–' : `${Number(v).toFixed(0)} %`);
