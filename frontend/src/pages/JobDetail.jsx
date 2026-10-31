import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { applications, jobs as jobsApi, ml, parseRequirements } from "../api";
import { useAuth } from "../auth";
import AnalysisDetail from "../components/AnalysisDetail";
import Department from "../components/Department";
import FileDrop from "../components/FileDrop";

export const AI_STATES = {
  not_started: "CV ešte nebolo nahrané",
  queued: "Čaká na analýzu",
  processing: "CV sa spracúva",
  completed: "Analýza dokončená",
  failed: "Analýza zlyhala",
};

export default function JobDetail() {
  const { id } = useParams(),
    { user } = useAuth();
  const [job, setJob] = useState(null),
    [error, setError] = useState(""),
    [file, setFile] = useState(null),
    [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false),
    [applicationId, setApplicationId] = useState(null),
    [task, setTask] = useState(null),
    [analysis, setAnalysis] = useState(null);
  const [capabilities, setCapabilities] = useState(null),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setApplicationId(null);
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
            const status = await ml.status(existing.id);
            if (!cancelled) setTask(status);
          }
        }
        if (!cancelled) setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err.message);
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
        } catch (err) {
          if (err.status !== 409) throw err;
          const existing = (await applications.mine()).find(
            (a) => a.job.id === job.id,
          );
          if (!existing) throw err;
          current = existing.id;
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
      <p className="error">{error}</p>
    ) : (
      <div className="loading">Načítavam…</div>
    );
  const submitted = task && task.state !== "not_started";
  return (
    <>
      <Link to="/jobs" className="back">
        ← Späť na pozície
      </Link>
      <div className="detail">
        <div className="card">
          <Department name={job.department} />
          <h1 style={{ marginTop: ".8rem" }}>{job.title}</h1>
          <p className="pre">{job.description}</p>
          <h3>Požadované zručnosti</h3>
          <div>
            {parseRequirements(job.requirements).map((r) => (
              <span key={r.skill} className="chip">
                {r.skill}
                {r.weight != null && <small>váha {r.weight}</small>}
              </span>
            ))}
          </div>
          <h3>Ako prebieha výber</h3>
          <ol
            className="muted"
            style={{ paddingLeft: "1.1rem", lineHeight: 1.9 }}
          >
            <li>
              Odošlete CV. Prihláška sa uloží a analýza prebehne na pozadí.
            </li>
            <li>HR posúdi podklady a vašu prihlášku.</li>
            <li>O ďalšom postupe rozhodne HR pracovník.</li>
          </ol>
        </div>
        <div className="card apply">
          <h2>Prihláška</h2>
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
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {user?.role === "user" && loaded && !submitted && (
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
              <button disabled={busy || !file || !consent}>
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
              <p className="success">
                ✓ Prihláška č. {applicationId} je uložená
              </p>
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
        </div>
      </div>
    </>
  );
}
