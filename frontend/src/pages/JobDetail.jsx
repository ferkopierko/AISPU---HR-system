import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { applications, jobs as jobsApi, ml, parseRequirements } from "../api";
import { useAuth } from "../auth";
import AnalysisDetail from "../components/AnalysisDetail";
import Department from "../components/Department";
import FileDrop from "../components/FileDrop";
import { IconAlert, IconArrowLeft, IconArrowRight, IconCheck } from "../components/Icons";
import JobFacts from "../components/JobFacts";
import ScoreBadge from "../components/ScoreBadge";
import StatusPill from "../components/StatusPill";

export const AI_STATES = {
  not_started: "CV ešte nebolo nahrané",
  queued: "Čaká na analýzu",
  processing: "CV sa spracúva",
  completed: "Analýza dokončená",
  failed: "Analýza zlyhala",
};

// Pozícia po uzávierke alebo uzavretá – Backend 1 vráti 404.
const NOT_AVAILABLE =
  "Táto pozícia už nie je dostupná. Je uzavretá alebo jej prešla uzávierka.";

export default function JobDetail() {
  const { id } = useParams(),
    { user } = useAuth();
  const [job, setJob] = useState(null),
    [error, setError] = useState(""),
    [file, setFile] = useState(null),
    [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false),
    [applicationId, setApplicationId] = useState(null),
    [myApplication, setMyApplication] = useState(null),
    [task, setTask] = useState(null),
    [analysis, setAnalysis] = useState(null);
  const [capabilities, setCapabilities] = useState(null),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setApplicationId(null);
    setMyApplication(null);
    setTask(null);
    setAnalysis(null);
    setFile(null);
    setError("");
    async function load() {
      try {
        const [offer, config] = await Promise.all([
          jobsApi.get(id),
          ml.capabilities(),
        ]);
        if (cancelled) return;
        setJob(offer);
        setCapabilities(config);
        if (user?.role === "user") {
          const mine = await applications.mine();
          const existing = mine.find((a) => String(a.job.id) === id);
          if (existing && !cancelled) {
            setApplicationId(existing.id);
            setMyApplication(existing);
            const status = await ml.status(existing.id);
            if (!cancelled) setTask(status);
          }
        }
        if (!cancelled) setLoaded(true);
      } catch (err) {
        if (!cancelled)
          setError(err.status === 404 ? NOT_AVAILABLE : err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);
  useEffect(() => {
    if (
      !applicationId ||
      !task ||
      !["queued", "processing", "completed"].includes(task.state)
    )
      return;
    let cancelled = false,
      timer;
    async function poll() {
      try {
        const status = await ml.status(applicationId);
        if (cancelled) return;
        setTask(status);
        if (status.state === "completed") {
          const result = await ml.result(applicationId);
          if (!cancelled) setAnalysis(result);
        } else if (["queued", "processing"].includes(status.state))
          timer = setTimeout(poll, 1500);
      } catch (err) {
        if (!cancelled) {
          setError("Kontrola analýzy zlyhala: " + err.message);
          timer = setTimeout(poll, 5000);
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [applicationId, task?.state]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    let current = applicationId;
    try {
      if (!current) {
        try {
          current = (await applications.create(job.id, consent)).id;
          setMyApplication({ id: current, status: "submitted" });
        } catch (err) {
          if (err.status !== 409) throw err;
          const existing = (await applications.mine()).find(
            (a) => a.job.id === job.id,
          );
          if (!existing) throw err;
          current = existing.id;
          setMyApplication(existing);
        }
        setApplicationId(current);
      }
      setTask(await ml.analyze(current, file));
    } catch (err) {
      setError((current ? "Prihláška zostala uložená. " : "") + err.message);
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    setError("");
    try {
      setTask(await ml.retry(applicationId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (!job)
    return error ? (
      <div className="empty">
        <IconAlert size={32} />
        <strong>Pozícia nie je k dispozícii</strong>
        <p>{error}</p>
        <Link to="/jobs" className="btn secondary btn-sm">
          Prezrieť otvorené pozície
        </Link>
      </div>
    ) : (
      <div className="detail" aria-busy="true">
        <div className="detail-main">
          <span className="skeleton" style={{ width: 80, height: 14 }} />
          <span className="skeleton" style={{ width: "60%", height: 36 }} />
          <span className="skeleton" style={{ width: "100%", height: 96 }} />
        </div>
      </div>
    );
  const submitted = task && task.state !== "not_started";
  // stiahnutú alebo zamietnutú prihlášku už nemá zmysel dopĺňať o CV
  const closedApplication = ["withdrawn", "rejected"].includes(
    myApplication?.status,
  );
  const requirements = parseRequirements(job.requirements);
  return (
    <>
      <Link to="/jobs" className="back">
        <IconArrowLeft size={16} /> Všetky pozície
      </Link>
      <div className="detail">
        <article className="detail-main">
          <header className="detail-head">
            <Department name={job.department} />
            <h1>{job.title}</h1>
          </header>
          <JobFacts job={job} />
          {job.description && (
            <section>
              <h2>O pozícii</h2>
              <p className="pre">{job.description}</p>
            </section>
          )}
          {job.responsibilities && (
            <section>
              <h2>Náplň práce</h2>
              <p className="pre">{job.responsibilities}</p>
            </section>
          )}
          {requirements.length > 0 && (
            <section>
              <h2>Požadované zručnosti</h2>
              <div className="chips">
                {requirements.map((r) => (
                  <span key={r.skill} className="chip">
                    {r.skill}
                    {r.weight != null && <small>váha {r.weight}</small>}
                  </span>
                ))}
              </div>
            </section>
          )}
          {job.benefits && (
            <section>
              <h2>Čo ponúkame</h2>
              <p className="pre">{job.benefits}</p>
            </section>
          )}
          <section>
            <h2>Ako prebieha výber</h2>
            <ol className="steps">
              <li>
                Odošlete CV. Prihláška sa uloží a analýza prebehne na pozadí.
              </li>
              <li>HR posúdi podklady a vašu prihlášku.</li>
              <li>O ďalšom postupe rozhodne HR pracovník.</li>
            </ol>
          </section>
        </article>
        <aside className="apply" aria-labelledby="apply-title">
          <h2 id="apply-title">Prihláška</h2>
          {!user && (
            <p className="muted">
              Na odoslanie sa{" "}
              <Link to="/login" state={{ from: `/jobs/${id}` }}>
                prihláste
              </Link>{" "}
              alebo{" "}
              <Link to="/register" state={{ from: `/jobs/${id}` }}>
                zaregistrujte
              </Link>
              .
            </p>
          )}
          {user?.role === "admin" && (
            <p className="muted">HR účet sa na pozície neprihlasuje.</p>
          )}
          {myApplication && (
            <div className="applied">
              <p className="success">
                <IconCheck size={16} /> Prihláška na túto pozíciu je odoslaná
              </p>
              <dl className="applied-facts">
                <div>
                  <dt>Stav</dt>
                  <dd>
                    <StatusPill status={myApplication.status} />
                  </dd>
                </div>
                <div>
                  <dt>Zhoda</dt>
                  <dd>
                    {analysis ? (
                      <ScoreBadge value={analysis.score_percentage} />
                    ) : (
                      <span className="muted">
                        {AI_STATES[task?.state] ?? "zatiaľ bez výsledku"}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              <Link to="/my" className="btn secondary btn-sm">
                Moje prihlášky <IconArrowRight size={14} />
              </Link>
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              <IconAlert size={16} />
              {error}
            </p>
          )}
          {user?.role === "user" && loaded && !submitted && !closedApplication && (
            <form className="form" onSubmit={submit}>
              <FileDrop file={file} onChange={setFile} />
              <p className="muted ai-notice">
                {capabilities?.cloud_processing
                  ? capabilities.provider === "azure_llm"
                    ? "Text životopisu sa odošle do Azure LLM na extrakciu zručností a textových podkladov."
                    : "Text životopisu sa spracuje v Azure Language Custom NER."
                  : "Používa sa lokálna extrakcia pravidlami. Azure zatiaľ nie je zapnuté."}{" "}
                Skóre opisuje pokrytie požiadaviek, nie pravdepodobnosť
                prijatia.
              </p>
              <label className="checkbox">
                <input
                  required
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Súhlasím so spracovaním údajov na účely tejto prihlášky vrátane
                uvedeného spôsobu analýzy CV.
              </label>
              <button type="submit" disabled={busy || !file || !consent}>
                {busy && <span className="spinner" />}
                {busy
                  ? "Ukladám CV…"
                  : applicationId
                    ? "Doplniť CV k prihláške"
                    : "Odoslať prihlášku"}
              </button>
            </form>
          )}
          {submitted && (
            <>
              <p role="status" className="ai-status">
                {["queued", "processing"].includes(task.state) && (
                  <span className="spinner dark" />
                )}
                {AI_STATES[task.state]}
              </p>
              {task.state === "failed" && (
                <>
                  <p className="error">
                    {task.error_message} Prihlášku nemusíte odosielať znova.
                  </p>
                  <button disabled={busy} onClick={retry}>
                    Zopakovať analýzu
                  </button>
                </>
              )}
              {analysis && <AnalysisDetail analysis={analysis} />}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
