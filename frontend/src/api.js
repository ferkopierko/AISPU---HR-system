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
  // { email, password, fullName, phone? }
  register: (data) => request('/api/auth/register', { method: 'POST', body: data }).then((d) => d.user),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  // úplná náhrada profilu – vynechaný telefón sa vymaže
  updateMe: ({ fullName, phone }) => request('/api/auth/me', { method: 'PUT', body: { fullName, phone } }).then((d) => d.user),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/me/password', { method: 'PUT', body: { currentPassword, newPassword } }),
};

export const jobs = {
  list: () => request('/api/jobs').then((d) => d.jobs),
  get: (id) => request(`/api/jobs/${id}`).then((d) => d.job),
};

export const applications = {
  mine: () => request('/api/applications/mine').then((d) => d.applications),
  // consent = súhlas GDPR z formulára, Backend 1 bez neho prihlášku odmietne
  create: (jobId, consent) => request('/api/applications', { method: 'POST', body: { jobId, consent } }).then((d) => d.application),
  // stav -> withdrawn, Backend 1 zmaže CV a kontakt, Backend 2 analýzu; znova sa prihlásiť nedá
  withdraw: (id) => request(`/api/applications/${id}/withdraw`, { method: 'POST' }).then((d) => d.application),
};

export const admin = {
  applications: (filters = {}) => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    return request(`/api/admin/applications${qs ? `?${qs}` : ''}`).then((d) => d.applications);
  },
  setStatus: (id, status) =>
    request(`/api/admin/applications/${id}/status`, { method: 'PATCH', body: { status } }).then((d) => d.application),
  // CV sa otvára priamo odkazom (náhľad v novej karte / stiahnutie), session cookie ide automaticky
  cvUrl: (id, { download = false } = {}) => `/api/admin/applications/${id}/cv${download ? '?download=1' : ''}`,
  notes: (id) => request(`/api/admin/applications/${id}/notes`).then((d) => d.notes),
  addNote: (id, text) => request(`/api/admin/applications/${id}/notes`, { method: 'POST', body: { text } }).then((d) => d.note),

  // správa pozícií – všetky vrátane konceptov, uzavretých a po uzávierke
  jobs: () => request('/api/admin/jobs').then((d) => d.jobs),
  createJob: (job) => request('/api/admin/jobs', { method: 'POST', body: job }).then((d) => d.job),
  // PUT je úplná náhrada – treba poslať všetky polia pozície
  updateJob: (id, job) => request(`/api/admin/jobs/${id}`, { method: 'PUT', body: job }).then((d) => d.job),
};

// ---- Backend 2 ----
export const ml = {
  capabilities: () => request('/api/ml/capabilities'),
  status: (applicationId) => request(`/api/ml/status/${applicationId}`),
  retry: (applicationId) => request(`/api/ml/retry/${applicationId}`, { method: 'POST' }),
  analyze: (applicationId, file) => {
    const form = new FormData();
    form.append('file', file);
    form.append('application_id', String(applicationId));
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
