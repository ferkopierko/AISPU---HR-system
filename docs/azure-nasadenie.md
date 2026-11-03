# Nasadenie: aplikácia na Azure, dáta Backendu 2 vo Firebase

Rozdelenie: **Azure** hostí všetky tri aplikácie a databázu Backendu 1 (Azure SQL).
**Firebase** (Cloud Firestore) je databáza Backendu 2 – analýzy CV, história skóre aj fronta analýz.

| Čo | Kde | Adresa / zdroj |
|----|-----|----------------|
| Frontend (React + Node proxy) | Azure Web App `hr-frontend-frantisek` | <https://hr-frontend-frantisek.azurewebsites.net> |
| Backend 1 (Node.js / Express) | Azure Web App `hr-backend1-frantisek` | `https://hr-backend1-frantisek.azurewebsites.net` |
| Backend 2 (Python / FastAPI, NLP) | Azure Web App `hr-backend2-frantisek` | `https://hr-backend2-frantisek.azurewebsites.net` |
| Databáza Backendu 1 | Azure SQL `zadanie/sqlzadanie` | používatelia, pozície, prihlášky, súbory CV |
| Databáza Backendu 2 | Firebase `smartrecruit-ai-3af8b`, Firestore `(default)` | `cv_analyses` (+ `history`), `analysis_jobs` |

Web aplikácie bežia na pláne **`studenti-flask-plan` (F1 Free, Linux)**, Switzerland North,
nové zdroje sú v skupine `IS_HR_system_AISPU`.

Prečo nie celý Backend 2 na Firebase: Firebase spúšťa kód iba cez Cloud Functions / Cloud Run
(platený plán Blaze) a spaCy je na Functions priveľké. Frontend na Firebase Hosting by volal
Azure z inej domény a prehliadač by zablokoval session cookie.

## Architektúra

```
prehliadač ──▶ hr-frontend  (dist/ + proxy, frontend/azure/server.js)
                 │ /api/ml/* ─────────────▶ hr-backend2 ──▶ Firebase Firestore
                 │ /api/*   ──▶ hr-backend1 ──▶ Azure SQL        (cv_analyses, analysis_jobs)
                                 ▲     │
                    X-Internal-Key│     │ X-Internal-Key
                                 │     ▼
                   Backend 2 ──▶ Backend 1: overenie prihlášky, uloženie CV
                   Backend 1 ──▶ Backend 2: GDPR mazanie analýz
```

Na App Service nebeží nginx, preto [`frontend/azure/server.js`](../frontend/azure/server.js)
robí to isté ako [`nginx.conf`](../frontend/nginx.conf): servíruje React a presmeruje `/api/ml`
na Backend 2 a `/api` na Backend 1. Prehliadač volá jeden origin, takže session cookie funguje
bez CORS (s `NODE_ENV=production` je cookie `Secure`).

## Spoločný Firestore a ID prihlášok

Firestore `(default)` zdieľame s lokálnymi inštanciami kolegov. Dokumenty sú pomenované podľa
ID prihlášky, preto Azure SQL čísluje prihlášky **od 10001**
(`DBCC CHECKIDENT ('dbo.applications', RESEED, 10000)`); lokálne databázy používajú nižšie ID.
Pri novom nasadení databázy treba reseed zopakovať.

## Opätovné nasadenie kódu

```bash
az login
bash deploy/azure/deploy.sh              # všetko
bash deploy/azure/deploy.sh backend-2    # iba jedna aplikácia
```

Backend 1 a Backend 2 si závislosti zostavia v Azure (Oryx). Pre Backend 2 sa použije
[`backend-2/requirements-azure.txt`](../backend-2/requirements-azure.txt) – obsahuje aj
spaCy model `en_core_web_sm` a Firestore klienta. Prvý štart Backendu 2 trvá asi 2–3 minúty.

## Nastavenia (App settings)

Heslá a kľúče sú iba v App settings v Azure a v ignorovanom `.secrets/` – nie v repozitári.

- **Backend 1:** `NODE_ENV=production`, `BACKEND1_PORT=8080`, `AZURE_SQL_*`, `SESSION_SECRET`,
  `INTERNAL_API_KEY`, `CORS_ORIGIN`, `BACKEND2_URL`.
- **Backend 2:** `ANALYSIS_DB_PROVIDER=firestore`, `ANALYSIS_QUEUE_PROVIDER=firestore`,
  `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID=(default)`,
  `GOOGLE_APPLICATION_CREDENTIALS=/home/secrets/firebase-admin.json`, `AI_PROVIDER=local_rules`,
  `BACKEND1_URL`, `INTERNAL_API_KEY`, `CORS_ORIGIN`.
- **Frontend:** `BACKEND1_URL`, `BACKEND2_URL`.

Firebase kľúč je súbor `/home/secrets/firebase-admin.json` vo web aplikácii Backendu 2 – mimo
`wwwroot`, takže ho nasadenie kódu neprepíše a aplikácia ho neservíruje. Výmena kľúča:

```bash
az webapp deploy -g IS_HR_system_AISPU -n hr-backend2-frantisek --type static \
  --src-path .secrets/firebase-admin.json --target-path /home/secrets/firebase-admin.json
```

## Obmedzenia plánu F1 (zadarmo)

- 60 CPU minút denne na aplikáciu, 1 GB RAM, bez *Always On*.
- Po ~20 minútach nečinnosti aplikácie zaspia. Prvá požiadavka potom trvá dlhšie
  (Backend 2 so spaCy aj 1–2 minúty). Nedokončené úlohy ostávajú vo Firestore
  a dokončia sa po prebudení.
- Prázdnu frontu worker kontroluje raz za 30 s (bezplatná kvóta Firestore je 50 000 čítaní
  denne); nová prihláška ho zobudí okamžite.
- Sessions sú v pamäti Backendu 1 – po reštarte alebo uspaní sa treba znova prihlásiť.
- Backendy majú verejnú adresu (F1 nemá privátnu sieť). Chránia ich prihlásenie (session)
  a `X-Internal-Key` pre interné API.

## Náklady

- Web Apps na F1: zadarmo. Firestore: v rámci bezplatnej kvóty (plán Spark).
- Azure SQL Basic `sqlzadanie`: existovala už pred týmto nasadením.

## Pôvodná web app `IS-HR-Systém-presprávuzamestnancov`

Táto aplikácia vždy vracala HTTP 503: jej hostname je registrovaný s diakritikou (`systém`),
ale prehliadač ju volá cez punycode (`xn--…`) a Azure požiadavku nespáruje. Web app sa
nedá premenovať a vlastná doména na F1 nie je, preto frontend beží v novej
`hr-frontend-frantisek`. Pôvodnú aplikáciu je možné zmazať.
