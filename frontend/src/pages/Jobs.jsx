import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jobs as jobsApi, parseRequirements } from '../api';
import Department from '../components/Department';

// Obrazovka 1a – katalóg otvorených pozícií (Backend 1) s vyhľadávaním a filtrom oddelení.
export default function Jobs() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('');

  useEffect(() => {
    jobsApi.list().then(setJobs).catch((err) => setError(err.message));
  }, []);

  const departments = jobs ? [...new Set(jobs.map((j) => j.department))].sort() : [];
  const q = query.trim().toLowerCase();
  const visible = (jobs ?? []).filter(
    (j) =>
      (!dept || j.department === dept) &&
      (!q || [j.title, j.description, j.requirements].some((t) => t?.toLowerCase().includes(q)))
  );

  return (
    <>
      <section className="hero">
        <h1>Nájdite si prácu, ktorá vám sedí</h1>
        <p>Pošlite životopis. Analýza ukáže, ktoré požiadavky pozície sú v jeho texte doložené.</p>
        <div className="search">
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Hľadať pozíciu alebo zručnosť, napr. Python, Docker…"
          />
        </div>
      </section>

      {error && <p className="error">{error}</p>}
      {!jobs && !error && <div className="loading"><span className="spinner dark" /> Načítavam pozície…</div>}

      {jobs && (
        <>
          <div className="filters">
            <button className={`filter${!dept ? ' active' : ''}`} onClick={() => setDept('')}>
              Všetky ({jobs.length})
            </button>
            {departments.map((d) => (
              <button key={d} className={`filter${dept === d ? ' active' : ''}`} onClick={() => setDept(d)}>
                {d} ({jobs.filter((j) => j.department === d).length})
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="card empty">
              <div className="icon">🔍</div>
              <p>Žiadna pozícia nezodpovedá hľadaniu.</p>
            </div>
          ) : (
            <div className="grid">
              {visible.map((job) => (
                <Link key={job.id} to={`/jobs/${job.id}`} className="card job-card">
                  <Department name={job.department} />
                  <h2>{job.title}</h2>
                  <p className="clamp">{job.description}</p>
                  <div>
                    {parseRequirements(job.requirements).slice(0, 6).map((r) => (
                      <span key={r.skill} className="chip">{r.skill}</span>
                    ))}
                  </div>
                  <span className="more">Zobraziť a prihlásiť sa →</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
