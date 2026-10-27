import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { applications, jobs as jobsApi, ml, parseRequirements } from '../api';
import { useAuth } from '../auth';
import AnalysisDetail from '../components/AnalysisDetail';
import Department from '../components/Department';
import FileDrop from '../components/FileDrop';

// Obrazovka 1b – detail pozície a prihláška s CV.
// Tu frontend spája oba backendy:
//   1. Backend 1 vytvorí prihlášku (applications.id),
//   2. Backend 2 analyzuje CV voči požiadavkám pozície a uloží skóre k tomuto id.
export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState('form'); // form | sending | done
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    jobsApi.get(id).then(setJob).catch((err) => setError(err.message));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setStep('sending');
    try {
      const application = await applications.create(job.id, consent);
      // Ak pozícia nemá vyplnené požiadavky, porovnáva sa aspoň s popisom.
      const requirements = job.requirements || job.description || job.title;
      setAnalysis(await ml.analyze(application.id, file, requirements));
      setStep('done');
    } catch (err) {
      setError(err.message);
      setStep('form');
    }
  }

  if (!job) return error ? <p className="error">{error}</p> : <div className="loading"><span className="spinner dark" /> Načítavam…</div>;

  return (
    <>
      <Link to="/jobs" className="back">← Späť na pozície</Link>
      <div className="detail">
        <div className="card">
          <Department name={job.department} />
          <h1 style={{ marginTop: '0.8rem' }}>{job.title}</h1>
          <p className="pre">{job.description}</p>
          <h3>Požadované zručnosti</h3>
          <div>
            {parseRequirements(job.requirements).map((r) => (
              <span key={r.skill} className="chip">
                {r.skill}
                {r.weight != null && <small>{r.weight} %</small>}
              </span>
            ))}
          </div>
          <h3>Ako prebieha výber</h3>
          <ol className="muted" style={{ paddingLeft: '1.1rem', lineHeight: 1.9, margin: 0 }}>
            <li>Pošlete životopis, systém ho hneď vyhodnotí.</li>
            <li>HR posúdi prihlášku a ozve sa vám.</li>
            <li>Úspešných uchádzačov pozveme na pohovor.</li>
          </ol>
        </div>

        <div className="card apply">
          <h2>Prihláška</h2>
          {!user && (
            <p className="muted">
              Na odoslanie prihlášky sa musíte <Link to="/login" state={{ from: `/jobs/${id}` }}>prihlásiť</Link>{' '}
              alebo <Link to="/register">zaregistrovať</Link>.
            </p>
          )}
          {user?.role === 'admin' && <p className="muted">HR účet sa na pozície neprihlasuje.</p>}

          {user?.role === 'user' && step !== 'done' && (
            <form className="form" onSubmit={handleSubmit} style={{ marginTop: '0.8rem' }}>
              <FileDrop file={file} onChange={setFile} />
              <label className="checkbox">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
                Súhlasím so spracovaním osobných údajov na účely výberového konania (GDPR). Údaje budú vymazané
                najneskôr po 6 mesiacoch.
              </label>
              {error && <p className="error">{error}</p>}
              <button disabled={step === 'sending' || !file || !consent}>
                {step === 'sending' && <span className="spinner" />}
                {step === 'sending' ? 'Analyzujem životopis…' : 'Odoslať prihlášku'}
              </button>
            </form>
          )}

          {step === 'done' && (
            <>
              <p className="success">✓ Prihláška bola odoslaná</p>
              <p className="muted" style={{ marginTop: 0 }}>Takto systém vyhodnotil vaše CV:</p>
              <AnalysisDetail analysis={analysis} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
