# Frontend – SmartRecruit HR

React 18 + Vite 5 + React Router. Spája oba backendy:

| Cesta vo frontende | Volá |
|--------------------|------|
| `/api/auth/*`, `/api/jobs/*`, `/api/applications`, `/api/admin/*` | **Backend 1** (Node.js, port 3001) |
| `/api/ml/*` | **Backend 2** (Python, port 8000) |

Vo vývoji to presmeruje Vite proxy (`vite.config.js`), v Dockeri nginx (`nginx.conf`).
Vďaka tomu je všetko na jednej adrese a session cookie z Backendu 1 funguje bez problémov s CORS.

## Spustenie

```powershell
# najprv spusti Backend 1 (3001) a Backend 2 (8000) podľa hlavného README
cd frontend
npm install
npm run dev        # http://localhost:5173
```

## Obrazovky

| Obrazovka | Kto | Čo robí |
|-----------|-----|---------|
| Prihlásenie / registrácia | všetci | session v Backende 1, registrácia vždy ako uchádzač |
| Pozície (`/jobs`) | všetci | katalóg otvorených pozícií |
| Detail pozície (`/jobs/:id`) | uchádzač | nahranie CV + súhlas GDPR → Backend 1 vytvorí prihlášku → Backend 2 analyzuje CV → uchádzač hneď vidí skóre |
| HR prehľad (`/admin`) | HR (admin) | prihlášky z Backendu 1 + skóre z Backendu 2, filter podľa pozície a stavu, zoradenie podľa zhody, detail zručností, zmena stavu |

## Súbory

```
src/
├── api.js                 – všetky volania oboch backendov
├── auth.jsx               – prihlásený používateľ (React context)
├── App.jsx                – routy
├── components/            – Layout (horná lišta), RequireRole, ScoreBadge, AnalysisDetail
└── pages/                 – Login, Register, Jobs, JobDetail, AdminApplications
```

## Docker

`Dockerfile` zostaví aplikáciu a servíruje ju cez nginx na porte 80. `nginx.conf` predpokladá,
že služby v `docker-compose.yml` sa volajú `backend-1` a `backend-2`.

## Čo zatiaľ chýba vo frontende

Backend je pripravený, popis API je v [docs/faza-2-backend-1.md](../docs/faza-2-backend-1.md) (sekcia 8).

- **Správa pozícií pre HR** – `GET/POST/PUT /api/admin/jobs` (`requirements` s váhami musia mať súčet 100).
- **„Moje prihlášky“ pre uchádzača** – `GET /api/applications/mine`.
- **Detail prihlášky v HR prehľade** – `candidate.name`, `candidate.phone` a `hasCv` sú už
  v `GET /api/admin/applications`; CV: odkaz na `/api/admin/applications/:id/cv`
  (náhľad) alebo `…/cv?download=1`; poznámky: `GET/POST /api/admin/applications/:id/notes`.
- **Filter „Všetky pozície“** – zoznam brať z `GET /api/admin/jobs`, nie z načítaných prihlášok.
- **Moje prihlášky / stav na detaile pozície** – iba frontend: `GET /api/applications/mine`
  (nájsť podľa `job.id`) + zhoda z `GET /api/ml/results/:id`; namiesto formulára ukázať stav.
- **Registrácia a profil** – `fullName` (povinné) a `phone` v `POST /api/auth/register`;
  profil `PUT /api/auth/me`, heslo `PUT /api/auth/me/password`. `/register` a `/login`
  prihláseného presmerovať (iba frontend).
- **Nové údaje pozície** – `location`, `employmentType`, `workMode`, `salaryMin/Max/Period`,
  `responsibilities`, `benefits`, `publishedAt`, `deadline` (popis v docs/faza-2-backend-1.md, sekcia 13).
- ✅ **Váhy zručností** – Backend 2 ich už používa pri výpočte pokrytia, frontend netreba meniť.
- ✅ **Súhlas GDPR** – `applications.create(jobId, consent)` ho posiela, Backend 1 ukladá `consent_at`.
