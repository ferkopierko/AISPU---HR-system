import { IconCheck, IconX } from './Icons';
import { ScoreRing } from './ScoreBadge';

const DEGREES = { phd: 'PhD.', master: 'magisterské', bachelor: 'bakalárske', 'high school': 'stredoškolské' };
const PROVIDERS = { azure_llm: 'Azure LLM', azure_custom_ner: 'Azure Language · Custom NER', local_rules: 'Lokálne pravidlá' };
const EVIDENCE_STATUS = { found: 'doložené', missing: 'nenašlo sa', uncertain: 'neisté' };
const ASSERTIONS = { supported: 'doložená zmienka', learning: 'učenie / plán', negated: 'negovaná skúsenosť', uncertain: 'neisté' };

/**
 * Výsledok analýzy CV z Backendu 2.
 * Uchádzač vidí iba skóre a zručnosti; HR (forHr) aj metriky a zbalený technický rozpis.
 */
export default function AnalysisDetail({ analysis, size = 96, forHr = false }) {
  const { score_percentage, matched_skills, missing_skills } = analysis;
  if (!forHr) {
    return (
      <div className="analysis">
        <div className="analysis-head">
          <ScoreRing value={score_percentage} size={size} />
          <p className="analysis-summary">{summary(matched_skills, missing_skills)}</p>
        </div>
        <SkillList label="Našli sme vo vašom CV" skills={matched_skills} kind="ok" />
        <SkillList label="Vo vašom CV sme nenašli" skills={missing_skills} kind="missing" />
        <p className="muted">Skóre ukazuje, koľko požiadaviek pozície sa našlo v texte CV. O výsledku výberu rozhoduje HR.</p>
      </div>
    );
  }

  const { skill_coverage, text_similarity, education, experience_years } = analysis;
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
      <SkillList label="Doložené v texte" skills={matched_skills} kind="ok" />
      <SkillList label="Nenašlo sa v texte" skills={missing_skills} kind="missing" />
      <SkillList label="Na overenie HR" skills={analysis.uncertain_skills} kind="missing" />
      <details className="ai-evidence">
        <summary>Podrobný rozpis analýzy</summary>
        <p className="ai-notice muted">
          <strong>{PROVIDERS[analysis.provider] ?? 'Staršia lokálna analýza'}</strong> · {analysis.model_version || 'verzia neuložená'}
          <br />
          {analysis.scoring_version === 'weighted-coverage-v1'
            ? 'Skóre = podiel váh doložených požiadaviek zo všetkých váh. Podobnosť textu, prax a osobné údaje skóre nemenia.'
            : 'Starší výpočet: 60 % pokrytie zručností + 40 % podobnosť textu. Výsledok nie je priamo porovnateľný s novým skóre.'}{' '}
          Nejde o pravdepodobnosť prijatia.
        </p>
        {analysis.skill_evidence?.map((item) => (
          <section key={item.skill}>
            <h4>{item.skill} <small>· váha {Number(item.weight).toFixed(1)} · {EVIDENCE_STATUS[item.status]}</small></h4>
            {item.mentions.length ? (
              uniqueMentions(item.mentions).map((mention, index) => (
                <blockquote key={index}>
                  <p>{mention.text}</p>
                  <small>{mentionSource(mention)}</small>
                </blockquote>
              ))
            ) : (
              <p className="muted">Chýbajúci údaj v CV nepotvrdzuje, že uchádzač zručnosť nemá.</p>
            )}
          </section>
        ))}
        <p className="muted">Model ani ochranné pravidlá pre neisté vety nerozumejú spoľahlivo každému kontextu. Podklady musí overiť HR. Prax a vzdelanie sú odhady lokálnych pravidiel.</p>
        <small>
          {analysis.analysis_metadata?.prompt_version && <>Prompt: {analysis.analysis_metadata.prompt_version} · tokeny: {analysis.analysis_metadata.usage?.total_tokens ?? 'neuvedené'} · </>}
          Výpočet: {analysis.scoring_version} · požiadavky {analysis.requirements_sha256?.slice(0, 12)} · CV {analysis.document_sha256?.slice(0, 12)}
        </small>
      </details>
    </div>
  );
}

function SkillList({ label, skills, kind }) {
  if (!skills?.length) return null;
  return (
    <div className="skills">
      <strong>{label}</strong>
      <div className="chips">
        {skills.map((s) => (
          <span key={s} className={`chip chip-${kind}`}>{kind === 'ok' ? <IconCheck size={12} /> : <IconX size={12} />}{s}</span>
        ))}
      </div>
    </div>
  );
}

function summary(matched = [], missing = []) {
  const total = matched.length + missing.length;
  if (!total) return 'Pozícia nemá zoznam zručností, skóre vychádza z celého textu.';
  return `Vo vašom CV sme našli ${matched.length} z ${total} požadovaných zručností.`;
}

function mentionSource(mention) {
  if (mention.source === 'azure_llm') {
    return `LLM · citácia overená v CV · ${ASSERTIONS[mention.assertion] || 'vyžaduje overenie HR'}. Bez kalibrovanej istoty.`;
  }
  if (mention.confidence == null) return 'Pravidlová extrakcia; bez istoty modelu.';
  return `Istota extrakcie: ${Math.round(mention.confidence * 100)} % — samostatný údaj, nie skóre uchádzača.`;
}

// Odrážky, ktoré pri čítaní PDF ostanú na začiatku vety: riadiace znaky (napr. U+007F, prehliadač ho kreslí ako ☒),
// •, ▪, ☒, pomlčky a súkromné znaky písma.
// eslint-disable-next-line no-control-regex
const LEADING_JUNK = /^[\s\u0000-\u001F\u007F-\u009F•‣⁃∙·■-◿☐-☒✓-✘–—*\--]+/u;

/** Úryvky z CV bez úvodných odrážok a bez opakovaní (rovnaká veta len raz). */
function uniqueMentions(mentions) {
  const seen = new Set();
  return mentions.reduce((out, mention) => {
    const text = (mention.context ?? '').replace(LEADING_JUNK, '').trim();
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    if (text && !seen.has(key)) {
      seen.add(key);
      out.push({ ...mention, text });
    }
    return out;
  }, []);
}

const fmt = (v) => (v == null ? '–' : `${Number(v).toFixed(0)} %`);
