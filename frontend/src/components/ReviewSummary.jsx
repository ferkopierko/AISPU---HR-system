import { useEffect, useRef, useState } from 'react';
import { admin } from '../api';
import { formatDateTime } from '../labels';
import { IconAlert, IconFile } from './Icons';

export default function ReviewSummary({ analysis }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false, timer;
    async function load() {
      try {
        const next = await admin.reviewSummary(analysis.application_id);
        if (!cancelled) {
          setResult(next); setError('');
          if (next.state === 'processing') timer = setTimeout(load, 2500);
        }
      } catch (err) { if (!cancelled) setError(err.message); }
    }
    setResult(null); setError(''); load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [analysis.application_id, analysis.analyzed_at, refresh]);
  async function generate() {
    setBusy(true); setError('');
    try {
      const next = await admin.createReviewSummary(analysis.application_id);
      if (mounted.current) {
        setResult(next);
        if (next.state === 'processing') setRefresh((v) => v + 1);
      }
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(false); }
  }
  const summary = result?.summary;
  const processing = busy || result?.state === 'processing';
  return <section className="review-summary" aria-label="Zhrnutie zhody s pozíciou">
    <div className="review-summary-heading"><IconFile size={18} /><h3>{summary?.provider === 'azure_llm' ? 'AI zhrnutie zhody' : 'Zhrnutie zhody s pozíciou'}</h3></div>
    {summary ? <>
      <div className="review-summary-lines">{summary.lines.map((line, index) => <p key={index}>{line}</p>)}</div>
      <small className="muted">{summary.provider === 'azure_llm' ? 'Vygenerované AI' : 'Prehľad z pravidlovej analýzy'}{summary.generated_at && ` · ${formatDateTime(summary.generated_at)}`}</small>
      {summary.provider === 'azure_llm' && <details className="review-summary-provenance"><summary>Podrobnosti zhrnutia</summary><small>{summary.model} · {summary.usage_scope === 'shared_analysis' ? `Súčasť analýzy CV, spoločná spotreba ${summary.shared_usage?.total_tokens ?? 'neuvedené'} tokenov. Bez ďalšieho AI volania.` : `${summary.usage?.total_tokens ?? 'neuvedené'} tokenov`}</small></details>}
    </> : processing ? <p className="ai-status" role="status"><span className="spinner dark" />AI pripravuje zhrnutie…</p> : <>
      {!error && <p className="muted">Stručný prehľad doložených zručností, medzier a otázky na pohovor. Vytvorí sa raz a uloží k prihláške.</p>}
      <button className="secondary btn-sm" onClick={generate}>{result?.state === 'failed' ? 'Zopakovať tvorbu zhrnutia' : 'Vytvoriť AI zhrnutie'}</button>
    </>}
    {error && <p className="error" role="alert"><IconAlert size={15} />{error}</p>}
  </section>;
}
