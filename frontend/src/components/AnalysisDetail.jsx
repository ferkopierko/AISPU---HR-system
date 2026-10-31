import { ScoreRing } from './ScoreBadge';

const DEGREES = { phd: 'PhD.', master: 'magisterské', bachelor: 'bakalárske', 'high school': 'stredoškolské' };

/** Výsledok analýzy CV z Backendu 2. */
export default function AnalysisDetail({ analysis, size = 96 }) {
  const { score_percentage, skill_coverage, text_similarity, matched_skills, missing_skills, education, experience_years } = analysis;
  const degree = education?.degrees?.[0];
  return (
    <div className="analysis">
      <p className="ai-notice muted"><strong>{analysis.provider==='azure_llm'?'Azure LLM':analysis.provider==='azure_custom_ner'?'Azure Language · Custom NER':analysis.provider==='local_rules'?'Lokálne pravidlá':'Staršia lokálna analýza'}</strong> · {analysis.model_version || 'verzia neuložená'}<br/>{analysis.scoring_version==='weighted-coverage-v1'?'Skóre = podiel váh doložených požiadaviek zo všetkých váh. Podobnosť textu, prax a osobné údaje skóre nemenia.':'Starší výpočet: 60 % pokrytie zručností + 40 % podobnosť textu. Výsledok nie je priamo porovnateľný s novým skóre.'} Nejde o pravdepodobnosť prijatia.</p>
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
      {analysis.skill_evidence?.length>0&&<details className="ai-evidence"><summary>Požiadavky, váhy a textové podklady</summary>{analysis.skill_evidence.map(item=><section key={item.skill}><h4>{item.skill} <small>· váha {Number(item.weight).toFixed(1)} · {({found:'doložené',missing:'nenašlo sa',uncertain:'neisté'})[item.status]}</small></h4>{item.mentions.length?item.mentions.map((mention,index)=><blockquote key={index}><p>{mention.context}</p><small>{mention.source==='azure_llm'?`LLM · citácia overená v CV · ${({supported:'doložená zmienka',learning:'učenie / plán',negated:'negovaná skúsenosť',uncertain:'neisté'})[mention.assertion]||'vyžaduje overenie HR'}. Bez kalibrovanej istoty.`:mention.confidence==null?'Pravidlová extrakcia; bez istoty modelu.':`Istota extrakcie: ${Math.round(mention.confidence*100)} % — samostatný údaj, nie skóre uchádzača.`}</small></blockquote>):<p className="muted">Chýbajúci údaj v CV nepotvrdzuje, že uchádzač zručnosť nemá.</p>}</section>)}<p className="muted">Model ani ochranné pravidlá pre neisté vety nerozumejú spoľahlivo každému kontextu. Podklady musí overiť HR. Prax a vzdelanie sú odhady lokálnych pravidiel.</p><small>{analysis.analysis_metadata?.prompt_version&&<>Prompt: {analysis.analysis_metadata.prompt_version} · tokeny: {analysis.analysis_metadata.usage?.total_tokens ?? 'neuvedené'} · </>}Výpočet: {analysis.scoring_version} · požiadavky {analysis.requirements_sha256?.slice(0,12)} · CV {analysis.document_sha256?.slice(0,12)}</small></details>}
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
