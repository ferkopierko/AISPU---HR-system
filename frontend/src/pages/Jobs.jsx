import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jobs as jobsApi, parseRequirements } from '../api';
import Department from '../components/Department';
import { IconArrowRight, IconSearch } from '../components/Icons';
import { Deadline, JobMetaLine } from '../components/JobFacts';
import ListSkeleton from '../components/ListSkeleton';
import { formatSalary } from '../labels';

// Obrazovka 1a – katalóg otvorených pozícií (Backend 1) s vyhľadávaním a filtrom oddelení.
// Pozície po uzávierke Backend 1 do katalógu vôbec nepošle.
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
      (!q || [j.title, j.description, j.requirements, j.location].some((t) => t?.toLowerCase().includes(q)))
  );

  return (
    <>
      <header className="page-head jobs-head">
        <div>
          <span className="eyebrow">Otvorené pozície</span>
          <h1>{jobs ? positionsTitle(jobs.length) : 'Pozície'}</h1>
          <p className="muted">Pri každej pozícii vidíte požadované zručnosti. Po odoslaní CV hneď uvidíte, ktoré z nich sa v ňom našli.</p>
        </div>
        <label className="search">
          <IconSearch size={16} />
          <span className="visually-hidden">Hľadať pozíciu</span>
          <input
            id="jobs-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Názov, zručnosť alebo mesto"
          />
        </label>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {!jobs && !error && <ListSkeleton rows={3} />}

      {jobs && (
        <>
          {departments.length > 1 && (
            <div className="tabs" role="group" aria-label="Oddelenie">
              <button className={`tab${!dept ? ' active' : ''}`} aria-pressed={!dept} onClick={() => setDept('')}>
                Všetky <span className="num">{jobs.length}</span>
              </button>
              {departments.map((d) => (
                <button key={d} className={`tab${dept === d ? ' active' : ''}`} aria-pressed={dept === d} onClick={() => setDept(d)}>
                  {d} <span className="num">{jobs.filter((j) => j.department === d).length}</span>
                </button>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="empty">
              <IconSearch size={32} />
              <strong>{jobs.length ? 'Nič sme nenašli' : 'Momentálne nemáme otvorené pozície'}</strong>
              <p>{jobs.length ? `Pre „${query}“ nie je žiadna pozícia. Skúste inú zručnosť alebo zrušte filter oddelenia.` : 'Pozrite sa sem znova o pár dní.'}</p>
              {jobs.length > 0 && <button className="secondary btn-sm" onClick={() => { setQuery(''); setDept(''); }}>Zrušiť hľadanie</button>}
            </div>
          ) : (
            <ul className="row-list">
              {visible.map((job) => {
                const salary = formatSalary(job);
                return (
                  <li key={job.id}>
                    <Link to={`/jobs/${job.id}`} className="job-row">
                      <span className="job-main">
                        <Department name={job.department} />
                        <span className="row-title">{job.title}</span>
                        <JobMetaLine job={job} />
                        <span className="chips">
                          {parseRequirements(job.requirements).slice(0, 6).map((r) => (
                            <span key={r.skill} className="chip">{r.skill}</span>
                          ))}
                        </span>
                      </span>
                      <span className="job-side">
                        {salary && <span className="salary num">{salary}</span>}
                        <Deadline day={job.deadline} />
                      </span>
                      <span className="row-arrow" aria-hidden="true"><IconArrowRight /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function positionsTitle(n) {
  if (n === 0) return 'Momentálne žiadne pozície';
  if (n === 1) return '1 otvorená pozícia';
  return n < 5 ? `${n} otvorené pozície` : `${n} otvorených pozícií`;
}
