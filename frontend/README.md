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

## Čo zatiaľ chýba (treba doplniť aj v backende)

- **Správa pozícií pre HR** – Backend 1 nemá `POST/PUT /api/admin/jobs`, preto ju frontend zatiaľ nemá.
- **„Moje prihlášky“ pre uchádzača** – chýba `GET /api/applications/mine`.
- **Váhy zručností** – frontend už zobrazí `requirements` vo formáte
  `[{"skill":"java","weight":30}, …]`, ale Backend 2 berie zatiaľ iba pole reťazcov
  (`["java","sql"]`); pole objektov spracuje ako obyčajný text a váhy ignoruje.
- **Súhlas GDPR** sa zatiaľ len vyžaduje vo formulári, neukladá sa (chýba stĺpec, napr. `applications.consent_at`).
