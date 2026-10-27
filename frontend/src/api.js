// Volania oboch backendov. Cesty sú relatívne – vo vývoji ich presmeruje
// Vite proxy (vite.config.js), v Dockeri nginx (nginx.conf):
//   /api/ml/*  -> Backend 2 (Python / FastAPI, analýza CV)
//   /api/*     -> Backend 1 (Node.js / Express, používatelia, pozície, prihlášky)

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'include', // posiela session cookie hr.sid
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, errorMessage(data) || `Chyba servera (${res.status})`);
  }
  return data;
}

// Backend 1 vracia { error }, FastAPI { detail } (text alebo zoznam chýb validácie).
function errorMessage(data) {
  if (!data) return null;
  if (data.error) return data.error;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(', ');
  return null;
}

// ---- Backend 1 ----
export const auth = {
  me: () => request('/api/auth/me').then((d) => d.user),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }).then((d) => d.user),
  register: (email, password) => request('/api/auth/register', { method: 'POST', body: { email, password } }).then((d) => d.user),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
};

export const jobs = {
  list: () => request('/api/jobs').then((d) => d.jobs),
  get: (id) => request(`/api/jobs/${id}`).then((d) => d.job),
};

export const applications = {
  // consent = súhlas GDPR z formulára, Backend 1 bez neho prihlášku odmietne
  create: (jobId, consent) => request('/api/applications', { method: 'POST', body: { jobId, consent } }).then((d) => d.application),
};

export const admin = {
  applications: (filters = {}) => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    return request(`/api/admin/applications${qs ? `?${qs}` : ''}`).then((d) => d.applications);
  },
  setStatus: (id, status) =>
    request(`/api/admin/applications/${id}/status`, { method: 'PATCH', body: { status } }).then((d) => d.application),
};

// ---- Backend 2 ----
export const ml = {
  analyze: (applicationId, file, requirements) => {
    const form = new FormData();
    form.append('file', file);
    form.append('application_id', String(applicationId));
    form.append('requirements', requirements);
    return request('/api/ml/analyze', { method: 'POST', form });
  },
  // null, ak analýza ešte neexistuje
  result: (applicationId) =>
    request(`/api/ml/results/${applicationId}`).catch((err) => {
      if (err.status === 404) return null;
      throw err;
    }),
};

/** jobs.requirements môže byť JSON pole (["Java", …] alebo [{skill, weight}]) alebo voľný text. */
export function parseRequirements(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === 'string' ? { skill: item } : item));
    }
  } catch {
    // nie je JSON – voľný text
  }
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).map((skill) => ({ skill }));
}
