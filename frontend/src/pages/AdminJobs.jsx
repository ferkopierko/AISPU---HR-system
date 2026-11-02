import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { admin, parseRequirements } from '../api';
import Department from '../components/Department';
import { IconAlert, IconArchive, IconBriefcase, IconCheck, IconPencil, IconPlus, IconX } from '../components/Icons';
import ListSkeleton from '../components/ListSkeleton';
import {
  daysLeft, EMPLOYMENT_LABELS, formatDay, formatSalary, JOB_STATUS_LABELS, SALARY_PERIOD_LABELS, WORK_MODE_LABELS,
} from '../labels';

// Správa pozícií pre HR – zoznam z GET /api/admin/jobs, pridanie (POST) a úprava / zatvorenie (PUT).
export default function AdminJobs() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // null = zoznam, 'new' = nová pozícia, inak upravovaná pozícia
  const [closingId, setClosingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  function load() {
    return admin.jobs().then(setJobs).catch((err) => setError(err.message));
  }
  useEffect(() => { load(); }, []);

  async function closeJob(job) {
    setBusyId(job.id);
    setError('');
    try {
      // PUT je úplná náhrada – pošle sa celá pozícia, zmení sa iba stav
      await admin.updateJob(job.id, { ...jobToPayload(job), status: 'closed' });
      setNotice(`Pozícia „${job.title}“ je uzavretá. Uchádzači ju už nevidia.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      setClosingId(null);
    }
  }

  async function saved(job, isNew) {
    setEditing(null);
    setNotice(isNew ? `Pozícia „${job.title}“ je vytvorená.` : `Zmeny v pozícii „${job.title}“ sú uložené.`);
    window.scrollTo({ top: 0 });
    await load();
  }

  if (editing) {
    return (
      <JobForm
        job={editing === 'new' ? null : editing}
        departments={[...new Set((jobs ?? []).map((j) => j.department))].sort()}
        onCancel={() => setEditing(null)}
        onSaved={saved}
      />
    );
  }

  return (
    <>
      <header className="page-head">
        <div>
          <span className="eyebrow">HR</span>
          <h1>Správa pozícií</h1>
          <p className="muted">Koncepty a uzavreté pozície vidíte len vy. Uchádzači vidia iba otvorené pozície pred uzávierkou.</p>
        </div>
        <button onClick={() => { setNotice(''); setEditing('new'); }}>
          <IconPlus size={16} /> Nová pozícia
        </button>
      </header>

      {notice && <p className="success notice" role="status"><IconCheck size={16} />{notice}</p>}
      {error && <p className="error" role="alert"><IconAlert size={16} />{error}</p>}
      {!jobs && !error && <ListSkeleton rows={4} />}

      {jobs?.length === 0 && (
        <div className="empty">
          <IconBriefcase size={32} />
          <strong>Zatiaľ nemáte žiadnu pozíciu</strong>
          <p>Vytvorte prvú. Ako koncept ju uchádzači neuvidia, kým ju neotvoríte.</p>
        </div>
      )}

      {jobs?.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Pozícia</th>
                <th>Stav</th>
                <th className="num-col">Prihlášky</th>
                <th className="hide-sm">Uzávierka</th>
                <th><span className="visually-hidden">Akcie</span></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const expired = job.status === 'open' && daysLeft(job.deadline) < 0;
                return (
                  <tr key={job.id}>
                    <td>
                      <span className="cell-title">{job.title}</span>
                      <span className="cell-sub">
                        <Department name={job.department} />
                        {job.location && <span>{job.location}</span>}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill job-${expired ? 'expired' : job.status}`}>
                        {expired ? 'Po uzávierke' : JOB_STATUS_LABELS[job.status]}
                      </span>
                    </td>
                    <td className="num-col num">
                      {job.applicationCount > 0 ? <Link to={`/admin?jobId=${job.id}`}>{job.applicationCount}</Link> : 0}
                    </td>
                    <td className="hide-sm num">{formatDay(job.deadline) ?? <span className="muted">bez uzávierky</span>}</td>
                    <td className="row-actions">
                      {closingId === job.id ? (
                        <span className="confirm">
                          <span>Zatvoriť?</span>
                          <button className="btn-sm" disabled={busyId === job.id} onClick={() => closeJob(job)}>
                            {busyId === job.id && <span className="spinner" />}Áno, zatvoriť
                          </button>
                          <button className="ghost" onClick={() => setClosingId(null)} aria-label="Nezatvárať"><IconX size={16} /></button>
                        </span>
                      ) : (
                        <>
                          <button className="secondary btn-sm" onClick={() => { setNotice(''); setEditing(job); }}>
                            <IconPencil size={14} /> Upraviť
                          </button>
                          {job.status !== 'closed' && (
                            <button className="ghost" onClick={() => setClosingId(job.id)} title="Zatvoriť pozíciu">
                              <IconArchive size={16} /><span className="visually-hidden">Zatvoriť pozíciu {job.title}</span>
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Pozícia z GET /api/admin/jobs -> telo pre PUT (bez id, publishedAt, applicationCount). */
function jobToPayload(job) {
  const {
    title, department, description, requirements, status, location, employmentType, workMode,
    salaryMin, salaryMax, salaryPeriod, responsibilities, benefits, deadline,
  } = job;
  return {
    title, department, description, requirements, status, location, employmentType, workMode,
    salaryMin, salaryMax, salaryPeriod, responsibilities, benefits, deadline,
  };
}

/** Pozícia -> stav formulára (čísla a prázdne hodnoty ako reťazce pre inputy). */
function toForm(job) {
  const skills = parseRequirements(job?.requirements).map((r) => ({ skill: r.skill, weight: r.weight != null ? String(r.weight) : '' }));
  return {
    title: job?.title ?? '',
    department: job?.department ?? '',
    status: job?.status ?? 'draft',
    location: job?.location ?? '',
    employmentType: job?.employmentType ?? '',
    workMode: job?.workMode ?? '',
    salaryMin: job?.salaryMin != null ? String(job.salaryMin) : '',
    salaryMax: job?.salaryMax != null ? String(job.salaryMax) : '',
    salaryPeriod: job?.salaryPeriod ?? 'month',
    deadline: job?.deadline ?? '',
    description: job?.description ?? '',
    responsibilities: job?.responsibilities ?? '',
    benefits: job?.benefits ?? '',
    weighted: skills.some((s) => s.weight !== ''),
    skills: skills.length ? skills : [{ skill: '', weight: '' }],
  };
}

/** Stav formulára -> telo pre POST / PUT. */
function toPayload(form) {
  const skills = form.skills.filter((s) => s.skill.trim());
  const salaryMin = form.salaryMin === '' ? null : Number(form.salaryMin);
  const salaryMax = form.salaryMax === '' ? null : Number(form.salaryMax);
  return {
    title: form.title,
    department: form.department,
    status: form.status,
    location: form.location,
    employmentType: form.employmentType || null,
    workMode: form.workMode || null,
    salaryMin,
    salaryMax,
    salaryPeriod: salaryMin != null || salaryMax != null ? form.salaryPeriod : null,
    deadline: form.deadline || null,
    description: form.description,
    responsibilities: form.responsibilities,
    benefits: form.benefits,
    requirements: !skills.length
      ? null
      : form.weighted
        ? skills.map((s) => ({ skill: s.skill.trim(), weight: Number(s.weight) }))
        : skills.map((s) => s.skill.trim()),
  };
}

function JobForm({ job, departments, onCancel, onSaved }) {
  const [form, setForm] = useState(() => toForm(job));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const filled = form.skills.filter((s) => s.skill.trim());
  const weightSum = filled.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);

  function setSkill(i, field, value) {
    setForm((f) => ({ ...f, skills: f.skills.map((s, j) => (j === i ? { ...s, [field]: value } : s)) }));
  }
  function addSkill() {
    setForm((f) => ({ ...f, skills: [...f.skills, { skill: '', weight: '' }] }));
  }
  function removeSkill(i) {
    setForm((f) => ({ ...f, skills: f.skills.length > 1 ? f.skills.filter((_, j) => j !== i) : [{ skill: '', weight: '' }] }));
  }
  // rozdelí 100 bodov rovnomerne, zvyšok dostanú prvé zručnosti
  function spreadWeights() {
    const n = filled.length;
    if (!n) return;
    let k = 0;
    setForm((f) => ({
      ...f,
      skills: f.skills.map((s) => {
        if (!s.skill.trim()) return s;
        const w = Math.floor(100 / n) + (k++ < 100 % n ? 1 : 0);
        return { ...s, weight: String(w) };
      }),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.weighted && filled.length && weightSum !== 100) {
      return setError(`Súčet váh zručností musí byť 100, teraz je ${weightSum}.`);
    }
    setBusy(true);
    setError('');
    try {
      const payload = toPayload(form);
      const result = job ? await admin.updateJob(job.id, payload) : await admin.createJob(payload);
      onSaved(result, !job);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <span className="eyebrow">Správa pozícií</span>
          <h1>{job ? `Upraviť: ${job.title}` : 'Nová pozícia'}</h1>
          <p className="muted">Polia označené hviezdičkou sú povinné. Ostatné sa uchádzačom zobrazia, len ak ich vyplníte.</p>
        </div>
      </header>

      <form className="job-form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Základ</legend>
          <div className="field-grid">
            <label className="span-2">
              Názov pozície *
              <input id="job-title" value={form.title} onChange={set('title')} maxLength={200} required placeholder="Junior Backend Developer" />
            </label>
            <label>
              Oddelenie *
              <input id="job-department" value={form.department} onChange={set('department')} maxLength={100} required list="job-departments" placeholder="IT" />
              <datalist id="job-departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
            </label>
            <label>
              Stav
              <select id="job-status" value={form.status} onChange={set('status')} aria-describedby="job-status-hint">
                {Object.entries(JOB_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <span className="field-hint" id="job-status-hint">
                {{ draft: 'Uchádzači ju zatiaľ nevidia.', open: 'Zobrazí sa v katalógu do dňa uzávierky.', closed: 'Nikto sa na ňu nemôže prihlásiť.' }[form.status]}
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Podmienky</legend>
          <div className="field-grid">
            <label>
              Lokalita
              <input id="job-location" value={form.location} onChange={set('location')} maxLength={200} placeholder="Bratislava" />
            </label>
            <label>
              Režim práce
              <select id="job-work-mode" value={form.workMode} onChange={set('workMode')}>
                <option value="">neuvedený</option>
                {Object.entries(WORK_MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              Úväzok
              <select id="job-employment" value={form.employmentType} onChange={set('employmentType')}>
                <option value="">neuvedený</option>
                {Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              Uzávierka
              <input id="job-deadline" type="date" value={form.deadline} onChange={set('deadline')} aria-describedby="job-deadline-hint" />
              <span className="field-hint" id="job-deadline-hint">Posledný deň, keď sa dá prihlásiť.</span>
            </label>
            <div className="salary-fields span-2">
              <label>
                Plat od (€)
                <input id="job-salary-min" type="number" inputMode="numeric" min={0} max={10000000} step={1} value={form.salaryMin} onChange={set('salaryMin')} />
              </label>
              <label>
                Plat do (€)
                <input id="job-salary-max" type="number" inputMode="numeric" min={0} max={10000000} step={1} value={form.salaryMax} onChange={set('salaryMax')} />
              </label>
              <label>
                Obdobie
                <select id="job-salary-period" value={form.salaryPeriod} onChange={set('salaryPeriod')}>
                  {Object.entries(SALARY_PERIOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            {(form.salaryMin || form.salaryMax) && (
              <p className="field-hint span-2">
                Uchádzači uvidia: <b>{formatSalary(toPayload(form)) ?? '–'}</b>
              </p>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>Popis</legend>
          <div className="field-grid">
            <label className="span-2">
              O pozícii
              <textarea id="job-description" rows={4} value={form.description} onChange={set('description')} maxLength={10000} />
            </label>
            <label className="span-2">
              Náplň práce
              <textarea id="job-responsibilities" rows={4} value={form.responsibilities} onChange={set('responsibilities')} maxLength={10000} placeholder="Každú úlohu na nový riadok" />
            </label>
            <label className="span-2">
              Benefity
              <textarea id="job-benefits" rows={3} value={form.benefits} onChange={set('benefits')} maxLength={10000} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Požadované zručnosti</legend>
          <p className="field-hint">Podľa nich systém hodnotí CV. S váhami určíte, ktoré zručnosti sú dôležitejšie. Súčet váh musí byť 100.</p>
          <label className="checkbox">
            <input
              id="job-weighted" type="checkbox" checked={form.weighted}
              onChange={(e) => setForm((f) => ({ ...f, weighted: e.target.checked }))}
            />
            Zadať váhy zručností
          </label>
          <ul className="skill-rows">
            {form.skills.map((s, i) => (
              <li key={i}>
                <input
                  id={`job-skill-${i}`} aria-label={`Zručnosť ${i + 1}`} value={s.skill} maxLength={100} placeholder="napr. Python"
                  onChange={(e) => setSkill(i, 'skill', e.target.value)}
                />
                {form.weighted && (
                  <input
                    id={`job-weight-${i}`} aria-label={`Váha zručnosti ${i + 1}`} className="weight" type="number" inputMode="numeric"
                    min={1} max={100} step={1} value={s.weight} required={!!s.skill.trim()} placeholder="váha"
                    onChange={(e) => setSkill(i, 'weight', e.target.value)}
                  />
                )}
                <button type="button" className="ghost" onClick={() => removeSkill(i)} aria-label={`Odstrániť zručnosť ${i + 1}`}>
                  <IconX size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="skill-tools">
            <button type="button" className="secondary btn-sm" onClick={addSkill} disabled={form.skills.length >= 50}>
              <IconPlus size={14} /> Pridať zručnosť
            </button>
            {form.weighted && (
              <>
                <button type="button" className="ghost" onClick={spreadWeights} disabled={!filled.length}>Rozdeliť rovnomerne</button>
                <span className={`weight-sum num${weightSum === 100 ? ' ok' : ''}`} aria-live="polite">Súčet váh {weightSum} / 100</span>
              </>
            )}
          </div>
        </fieldset>

        {error && <p className="error" role="alert"><IconAlert size={16} />{error}</p>}
        <div className="form-actions sticky-actions">
          <button type="submit" disabled={busy}>
            {busy && <span className="spinner" />}{busy ? 'Ukladám…' : job ? 'Uložiť zmeny' : 'Vytvoriť pozíciu'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Zrušiť</button>
        </div>
      </form>
    </>
  );
}
