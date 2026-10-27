# Fáza 2 – Backend 1 (Node.js + Azure SQL)

Backend 1 spravuje používateľov, pracovné pozície a prihlášky. Dáta ukladá
v Azure SQL Database z [fázy 1](faza-1-databazy.md).

## Checklist

- [x] **Inicializácia a konfigurácia**
  - [x] Node.js projekt + balíky `express`, `mssql`, `express-session`, `bcrypt`, `cors`, `dotenv`
  - [x] Modul na bezpečné pripojenie na Azure SQL cez premenné prostredia
- [x] **Autentifikácia a autorizácia (sessions + roly)**
  - [x] `express-session` – cookie `httpOnly: true`, `sameSite: 'lax'`
  - [x] `POST /api/auth/register` – heslo hashované cez `bcrypt`
  - [x] `POST /api/auth/login` – do session sa zapíše `userId` a `role` (`'admin' | 'user'`)
  - [x] `POST /api/auth/logout` – zničenie session
  - [x] Middleware `requireAuth` a `requireRole('admin')`
- [x] **Obrazovka 1 – katalóg a reakcie**
  - [x] `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/applications`
- [x] **Obrazovka 2 – HR Admin Dashboard**
  - [x] `GET /api/admin/applications`, `PATCH /api/admin/applications/:id/status`
- [x] **CORS** pre frontend s `credentials: true`
- [x] **Doplnené pre frontend (2026-10-24)**
  - [x] `GET /api/applications/mine` – moje prihlášky
  - [x] `GET`, `POST`, `PUT /api/admin/jobs` – správa pozícií pre HR
  - [x] GDPR súhlas – `consent: true` v prihláške, uloží sa `applications.consent_at`
  - [x] `requirements` s váhami `[{"skill":"java","weight":30}]`
- [x] **Detail prihlášky pre HR (2026-10-27)**
  - [x] CV na stiahnutie / náhľad – `GET /api/admin/applications/:id/cv`
  - [x] Meno a telefón z CV v zozname prihlášok
  - [x] Poznámky HR – `GET`, `POST /api/admin/applications/:id/notes`

---

## 1. Inicializácia

```powershell
cd backend-1
npm install
npm run dev      # vývoj – automatický reštart pri zmene (node --watch)
npm start        # produkčné spustenie
```

Požiadavka: Node.js ≥ 20 (vyvíjané na Node 24.12).

| Balík | Verzia | Účel |
|-------|--------|------|
| `express` | 5.3 | HTTP server a routing |
| `mssql` | 12.7 | ovládač pre Azure SQL / SQL Server (postavený na `tedious`), connection pool |
| `express-session` | 1.19 | prihlasovanie cez session cookie |
| `bcrypt` | 6.0 | hashovanie hesiel (`users.password_hash`) |
| `cors` | 2.8 | povolenie požiadaviek z frontendu |
| `dotenv` | 18.0 | načítanie `.env` pri lokálnom vývoji |

Prečo `mssql` a nie ORM (Sequelize/TypeORM/Knex): schéma už existuje v
[`schema.sql`](../database/azure-sql/schema.sql) a sú to len 3 tabuľky. Čisté
parametrizované SQL je jednoduchšie a nepotrebuje druhú definíciu schémy.

## 2. Štruktúra

```
backend-1/
├── package.json
├── scripts/
│   └── create-admin.js     – vytvorenie admin účtu (npm run create-admin)
└── src/
    ├── server.js           – spustenie servera, kontrola DB pri štarte, korektné vypnutie
    ├── app.js              – Express aplikácia: CORS, JSON, session, routy, chyby
    ├── config/
    │   └── env.js          – načítanie a kontrola premenných prostredia
    ├── db/
    │   └── azureSql.js     – connection pool + query() + ping() + closePool()
    ├── middleware/
    │   ├── auth.js         – requireAuth, requireRole
    │   └── errorHandler.js – 404 + jednotný JSON formát chýb
    ├── routes/
    │   ├── auth.js         – /api/auth/*
    │   ├── jobs.js         – /api/jobs/*
    │   ├── applications.js – /api/applications
    │   └── admin.js        – /api/admin/*
    └── utils/
        ├── httpError.js    – chyba s HTTP stavom
        └── validate.js     – validácia id, emailu, hesla
```

## 3. Konfigurácia (premenné prostredia)

Backend číta **spoločný `.env` v koreni projektu**, takže údaje k Azure SQL sú
na jednom mieste pre deploy skript aj backend. V cloude sa premenné nastavujú
priamo (App Settings) a `.env` netreba. Premenné nastavené v prostredí majú
prednosť pred `.env`.

| Premenná | Povinná | Default | Popis |
|----------|:-------:|---------|-------|
| `AZURE_SQL_HOST` | ✅ | – | `zadanie.database.windows.net` |
| `AZURE_SQL_PORT` | | `1433` | |
| `AZURE_SQL_DATABASE` | ✅ | – | `sqlzadanie` |
| `AZURE_SQL_USER` | ✅ | – | |
| `AZURE_SQL_PASSWORD` | ✅ | – | |
| `SESSION_SECRET` | ✅ | – | podpis session cookie, náhodný reťazec |
| `BACKEND1_PORT` | | `3001` | port servera |
| `CORS_ORIGIN` | | `http://localhost:5173` | adresa frontendu |
| `NODE_ENV` | | – | `production` zapne secure cookie a `trust proxy` |

Ak povinná premenná chýba, aplikácia hneď pri štarte skončí chybou
`Chýbajú premenné prostredia: …`, namiesto toho, aby padla až pri prvom dotaze.

Generovanie `SESSION_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 4. Modul pripojenia na Azure SQL

Súbor: [`backend-1/src/db/azureSql.js`](../backend-1/src/db/azureSql.js)

Bezpečnostné prvky:

- **Žiadne údaje v kóde** – všetko ide z `config/env.js`.
- **Šifrované spojenie** – `encrypt: true`, `trustServerCertificate: false`
  (overuje sa certifikát servera, ochrana pred man-in-the-middle).
- **Parametrizované dotazy** – `query()` predáva hodnoty cez `request.input()`,
  nikdy ich nevkladá do SQL reťazca (ochrana pred SQL injection).
- **Jeden zdieľaný pool** – vytvorí sa pri prvom dotaze. Ak pripojenie zlyhá,
  ďalší dotaz skúsi pripojiť znova (nezostane uložená chyba).
- **Dlhší `connectionTimeout` (30 s)** – databáza na Basic tier sa môže po
  nečinnosti pripájať pomalšie.

API:

```js
const db = require('./db/azureSql');

const { recordset } = await db.query(
  'SELECT id, email, role FROM dbo.users WHERE email = @email',
  { email }
);

await db.ping();       // true, ak DB odpovedá
await db.closePool();  // pri vypínaní
```

## 5. Express aplikácia

- **CORS** – povolený iba `CORS_ORIGIN`, s `credentials: true` (frontend posiela session cookie).
- **Session** – cookie `hr.sid`, `httpOnly`, `sameSite: lax`, platnosť 8 h;
  v produkcii `secure` (iba HTTPS). `saveUninitialized: false` – cookie sa
  vytvorí až po prihlásení.
- **`GET /health`** – overí spojenie s DB: `200 {"status":"ok","database":"connected"}`,
  pri výpadku `503`. Chybová správa ide iba do logu, nie klientovi.
- **JSON telo** max. 100 kB; neplatný JSON → `400`.

> Session sa zatiaľ ukladá v pamäti (`MemoryStore`, predvolený v express-session).
> Pri reštarte sa používatelia odhlásia a nefunguje to pri viacerých inštanciách.
> Na vývoj to stačí; pre produkciu treba zvoliť úložisko session (napr. tabuľka v Azure SQL).

## 6. Roly a stavy (migrácia schémy)

Zadanie fázy 2 vyžaduje roly `admin | user` a stav „pozvaný na pohovor“.
Pôvodná schéma z fázy 1 mala `candidate / hr / admin` a stav `interview` nemala.
[`schema.sql`](../database/azure-sql/schema.sql) je preto upravená:

| Stĺpec | Hodnoty |
|--------|---------|
| `users.role` | `user` (default, uchádzač) / `admin` (HR) |
| `applications.status` | `submitted` (default) / `reviewing` / `interview` / `accepted` / `rejected` |

Na konci skriptu je **idempotentná migrácia** pre už nasadenú databázu:
`candidate → user`, `hr → admin` a do CHECK constraintu pribudne `interview`.
Stačí znova spustiť `powershell -File database\azure-sql\deploy.ps1`.

## 7. Autentifikácia a autorizácia

- **Heslá** – `bcrypt`, cost 12. Heslo musí mať 8 znakov až 72 bajtov (dlhšie
  heslo by bcrypt ticho orezal, preto ho odmietneme). Email sa ukladá orezaný
  a malými písmenami.
- **Session** – po registrácii aj prihlásení sa volá `req.session.regenerate()`
  (nové ID session, ochrana pred session fixation). V session je iba `userId` a `role`.
- **Registrácia** vytvorí vždy rolu `user` – pole `role` v tele sa ignoruje.
  Admina vytvorí skript:

  ```powershell
  cd backend-1
  npm run create-admin -- hr@firma.sk SilneHeslo123
  ```

  Ak účet s daným emailom existuje, nastaví mu rolu `admin` a nové heslo.
- **Login** – pri neexistujúcom emaile aj zlom hesle rovnaká odpoveď `401`
  a rovnaký čas (porovnáva sa s náhradným hashom), takže sa nedá zistiť, či účet existuje.
- **Middleware** ([`middleware/auth.js`](../backend-1/src/middleware/auth.js)):
  - `requireAuth` – bez session → `401`
  - `requireRole('admin')` – bez session → `401`, iná rola → `403`

> Rola sa uloží do session pri prihlásení. Ak sa používateľovi zmení rola
> v DB, prejaví sa to až po novom prihlásení.

## 8. API

Všetky odpovede sú JSON. Chyby majú tvar `{ "error": "správa" }`.
Klient musí posielať cookie (vo fetch: `credentials: 'include'`).

### Autentifikácia

| Metóda | Cesta | Prístup | Telo | Odpoveď |
|--------|-------|---------|------|---------|
| POST | `/api/auth/register` | verejné | `{ email, password }` | `201 { user }` + session · `400` · `409` email existuje |
| POST | `/api/auth/login` | verejné | `{ email, password }` | `200 { user }` + session · `401` |
| POST | `/api/auth/logout` | verejné | – | `204`, cookie zmazaná |
| GET | `/api/auth/me` | prihlásený | – | `200 { user }` · `401` |

`user = { id, email, role }`

### Obrazovka 1 – katalóg a reakcie

| Metóda | Cesta | Prístup | Telo | Odpoveď |
|--------|-------|---------|------|---------|
| GET | `/api/jobs` | verejné | – | `200 { jobs: [job] }` – iba `status = 'open'` |
| GET | `/api/jobs/:id` | verejné | – | `200 { job }` · `404` neexistuje / nie je otvorená |
| POST | `/api/applications` | prihlásený | `{ jobId, consent: true }` | `201 { application }` · `400` bez súhlasu · `404` pozícia · `409` už prihlásený |
| GET | `/api/applications/mine` | prihlásený | – | `200 { applications: [...] }` – iba vlastné, najnovšie prvé |

`job = { id, title, department, description, requirements, status }`

Prihláška sa priradí používateľovi **zo session** – `userId` v tele sa ignoruje.

**GDPR:** prihláška sa vytvorí iba s `consent: true` (presne boolean). Čas súhlasu
sa uloží do `applications.consent_at` (UTC) a vráti sa ako `consentAt`.

Položka `GET /api/applications/mine`:

```json
{
  "id": 5,
  "status": "interview",
  "createdAt": "2026-10-24T09:12:00.000Z",
  "consentAt": "2026-10-24T09:12:00.000Z",
  "job": { "id": 1, "title": "Junior Backend Developer", "department": "IT", "status": "open" }
}
```

Prihláška na pozíciu, ktorú HR medzičasom uzavrel, v zozname zostáva (`job.status = "closed"`).

### Obrazovka 2 – HR Admin Dashboard (iba `admin`)

| Metóda | Cesta | Telo | Odpoveď |
|--------|-------|------|---------|
| GET | `/api/admin/applications?status=&jobId=` | – | `200 { applications: [...] }` (filtre voliteľné) |
| PATCH | `/api/admin/applications/:id/status` | `{ status }` | `200 { application: { id, status } }` · `400` · `404` |

Povolené hodnoty pre PATCH: `reviewing`, `interview` (pozvaný na pohovor),
`accepted`, `rejected` (zamietnutý).

### Správa pozícií (iba `admin`)

| Metóda | Cesta | Telo | Odpoveď |
|--------|-------|------|---------|
| GET | `/api/admin/jobs` | – | `200 { jobs: [job + applicationCount] }` – všetky vrátane `draft` a `closed` |
| POST | `/api/admin/jobs` | `{ title, department, description?, requirements?, status? }` | `201 { job }` · `400` |
| PUT | `/api/admin/jobs/:id` | rovnaké ako POST | `200 { job }` · `400` · `404` |

- `title` (max. 200) a `department` (max. 100) sú povinné, `description` max. 10 000 znakov.
- `status`: `draft` / `open` (default) / `closed`. Verejný katalóg ukazuje iba `open`.
- `PUT` je úplná náhrada – vynechané voliteľné polia sa vymažú (`status` sa vráti na `open`).
- Pozície sa nemažú (mali by prihlášky); na skrytie slúži `status: "closed"`.

**`requirements`** – tri formáty, rovnaké číta frontend aj Backend 2:

| Formát | Príklad | Validácia |
|--------|---------|-----------|
| voľný text | `"Java, SQL, 2 roky praxe"` | max. 4 000 znakov |
| pole zručností | `["Java", "SQL"]` | 1–50 položiek, max. 100 znakov, bez duplicít |
| pole s váhami | `[{"skill":"Java","weight":70}, {"skill":"SQL","weight":30}]` | váha celé číslo 1–100, **súčet = 100**, všetky položky s váhou |

Pole môže prísť ako JSON pole aj ako reťazec s JSON poľom. Uloží sa ako JSON reťazec
do `jobs.requirements` a `GET` ho vráti ako reťazec (frontend ho parsuje cez `parseRequirements`).

Položka zoznamu:

```json
{
  "id": 1,
  "status": "submitted",
  "createdAt": "2026-10-19T10:00:00.000Z",
  "candidate": { "id": 3, "email": "jan@test.sk", "name": "Ján Novák", "phone": "+421 905 123 456" },
  "job": { "id": 1, "title": "Backend vývojár", "department": "IT" },
  "hasCv": true
}
```

`name` a `phone` vytiahne z CV Backend 2 (`null`, kým CV nebolo analyzované alebo sa
nenašli). `hasCv` hovorí, či sa dá CV stiahnuť.

### Detail prihlášky (iba `admin`)

| Metóda | Cesta | Telo | Odpoveď |
|--------|-------|------|---------|
| GET | `/api/admin/applications/:id/cv` | – | súbor CV: PDF `inline` (náhľad v prehliadači) · `404` bez CV |
| GET | `/api/admin/applications/:id/cv?download=1` | – | súbor ako `attachment` (stiahnutie); DOCX sa sťahuje vždy |
| GET | `/api/admin/applications/:id/notes` | – | `200 { notes: [{ id, text, createdAt, author: { id, email } }] }` – najstaršie prvé · `404` |
| POST | `/api/admin/applications/:id/notes` | `{ text }` (1–2000 znakov) | `201 { note }` · `400` · `404` |

Poznámky sa iba pridávajú (bez úprav a mazania), autorom je prihlásený HR.
CV odpoveď má `Cache-Control: private, no-store` (osobné údaje).

Vo frontende: `<a href={`/api/admin/applications/${id}/cv`} target="_blank">` (náhľad)
alebo `…/cv?download=1` (stiahnutie) – session cookie sa pošle automaticky.

### Príklad (PowerShell)

```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$api = 'http://localhost:3001/api'
Invoke-RestMethod "$api/auth/register" -Method Post -WebSession $s -ContentType 'application/json' -Body '{"email":"jan@test.sk","password":"heslo1234"}'
Invoke-RestMethod "$api/jobs" -WebSession $s
Invoke-RestMethod "$api/applications" -Method Post -WebSession $s -ContentType 'application/json' -Body '{"jobId":1,"consent":true}'
Invoke-RestMethod "$api/applications/mine" -WebSession $s
```

## 9. Test inicializácie (2026-10-14)

| Test | Výsledok |
|------|----------|
| `npm install` | ✅ 0 zraniteľností |
| Štart servera | ✅ `Pripojené na Azure SQL (zadanie.database.windows.net/sqlzadanie)` |
| `GET /health` | ✅ `200 {"status":"ok","database":"connected"}` |
| CORS z `http://localhost:5173` | ✅ `Access-Control-Allow-Origin` + `Allow-Credentials: true` |
| Zlé heslo k DB | ✅ odmietnuté: `Login failed for user 'Captain'` |
| Chýbajúci `SESSION_SECRET` | ✅ štart zlyhá s `Chýbajú premenné prostredia: SESSION_SECRET` |
| `bcrypt` hash + compare | ✅ `$2b$12$…`, porovnanie `true` |

## 10. Test API (2026-10-19)

Testované reálnymi HTTP požiadavkami na Express aplikáciu, databáza bola
nahradená v pamäti (firewall Azure SQL neprepúšťal aktuálnu IP) – 15/15 ✅:

| Oblasť | Overené |
|--------|---------|
| Jobs | zoznam iba `open`, detail, `404` pre uzavretú, `400` pre `abc` / `1.5` |
| Register | validácia emailu, hesla a JSON, `201`, rola vždy `user`, hash `$2b$12$`, cookie `HttpOnly; SameSite=Lax`, `409` duplicita |
| Login | rovnaké `401` pre zlé heslo aj neexistujúci účet, nové ID session po prihlásení |
| Applications | `401` bez prihlásenia, `404` uzavretá pozícia, `userId` zo session, `409` druhá prihláška |
| Admin | `401` anonym, `403` user, výpis + filtre, PATCH `interview` / `rejected`, `400` neplatný stav, `404` |
| Logout | `204`, stará cookie už neplatí |
| CORS | `Allow-Credentials: true`, preflight pre `PATCH` |

**Zostáva:** povoliť IP vo firewalle Azure SQL, spustiť `deploy.ps1` (migrácia
rolí a stavov) a overiť endpointy proti reálnej databáze.

## 11. Endpointy pre frontend (2026-10-24)

Doplnené podľa zoznamu „Čo zatiaľ chýba“ z [frontend/README.md](../frontend/README.md).

| Súbor | Zmena |
|-------|-------|
| [`routes/applications.js`](../backend-1/src/routes/applications.js) | `GET /mine`, povinný `consent: true` v `POST` |
| [`routes/adminJobs.js`](../backend-1/src/routes/adminJobs.js) | nový – `GET`, `POST`, `PUT /api/admin/jobs` |
| [`utils/jobInput.js`](../backend-1/src/utils/jobInput.js) | nový – validácia pozície a formátov `requirements` |
| [`schema.sql`](../database/azure-sql/schema.sql) | stĺpec `applications.consent_at DATETIME2(0) NULL` + idempotentná migrácia (`COL_LENGTH`) |
| `frontend/src/api.js`, `pages/JobDetail.jsx` | `applications.create(jobId, consent)` – posiela stav GDPR checkboxu (inak by prihláška skončila `400`) |

**Test** proti lokálnemu SQL Serveru v Dockeri (`hr-mssql`, seed účty) – 10/10 ✅:

| Oblasť | Overené |
|--------|---------|
| Oprávnenia | `/api/admin/jobs` – anonym `401`, uchádzač `403` |
| Validácia pozície | chýbajúce polia, zlý `status`, súčet váh ≠ 100, zmiešané položky, desatinná váha, duplicitná zručnosť, neplatný JSON, dlhý `title` → `400` |
| `POST` | vážené požiadavky ako pole aj reťazec, orezanie medzier, `draft` |
| `GET` / `PUT` | admin vidí `draft` aj `applicationCount`, verejný katalóg nie; `PUT` publikuje pozíciu; `404` / `400` |
| GDPR | bez `consent` aj s `"true"` (reťazec) → `400`; s `true` → `201` a `consentAt` ≈ teraz |
| `/mine` | `401` anonym, vlastné prihlášky s pozíciou, HR má prázdny zoznam, zmena stavu od HR sa prejaví |
| Uzavretá pozícia | prihláška v `/mine` zostane s `job.status = closed`, nová prihláška → `404` |
| Migrácia | stĺpec `consent_at` zmazaný → opätovné spustenie `mssql-init` ho doplnil |

Testovacie pozície a prihlášky boli po teste zmazané.

## 12. Detail prihlášky – CV, kontakt, poznámky (2026-10-27)

### Ako sa CV dostane do Azure SQL

Databázy sa navzájom nevidia, CV si preto odovzdajú backendy:

```
Frontend --(CV, cookie hr.sid)--> Backend 2: analýza, meno + telefón z CV
                                     |
                                     | PUT /api/internal/applications/:id/cv
                                     | X-Internal-Key + preposlaná cookie hr.sid
                                     v
                                  Backend 1: overí kľúč a že prihláška patrí uchádzačovi
                                     -> application_cvs (súbor), applications.candidate_name/phone
HR --> GET /api/admin/applications/:id/cv --> Backend 1 (session, rola admin)
```

- **`INTERNAL_API_KEY`** – spoločný tajný kľúč oboch backendov (`.env`, v Dockeri ho
  odovzdá `docker-compose.yml`). Bez neho interný endpoint vracia `503` a Backend 2 CV neposiela.
- **Preposlaná session cookie** – Backend 1 overí, že prihláška patrí prihlásenému
  uchádzačovi. Ak nie (`401` / `403` / `404`), Backend 2 vráti rovnakú chybu a analýzu
  neuloží. Predtým mohol ktokoľvek poslať analýzu k ľubovoľnému `application_id`.
- Backend 1 znova overí typ súboru podľa obsahu (`%PDF-` / `PK`) a veľkosť (max. 5 MB).
- Opakovaná analýza CV aj kontakt nahradí.

### Schéma ([`schema.sql`](../database/azure-sql/schema.sql), idempotentne)

| Zmena | Popis |
|-------|-------|
| `applications.candidate_name` NVARCHAR(200), `candidate_phone` NVARCHAR(50) | kontakt z CV |
| `application_cvs` | `application_id` (PK, FK cascade), `filename`, `content_type` (CHECK PDF/DOCX), `size_bytes`, `data` VARBINARY(MAX), `uploaded_at` |
| `application_notes` | `id`, `application_id` (FK cascade), `author_id` (FK users), `text` NVARCHAR(2000), `created_at` |

CV je v samostatnej tabuľke, aby zoznam prihlášok nenačítaval binárne dáta.
`application_notes.author_id` nemá `ON DELETE CASCADE` – SQL Server nepovolí dve
kaskádové cesty z `users`.

### Nové súbory

| Súbor | Účel |
|-------|------|
| [`routes/internal.js`](../backend-1/src/routes/internal.js) | `PUT /api/internal/applications/:id/cv` |
| [`middleware/internalAuth.js`](../backend-1/src/middleware/internalAuth.js) | overenie `X-Internal-Key` (porovnanie v konštantnom čase) |

`app.js`: interná route je zaregistrovaná pred globálnym JSON parserom (ten má limit
100 kB, CV v base64 má až ~7 MB) a session je presunutá pred ňu.

### Test (lokálny Docker, cez frontend proxy `localhost:5173`) – 10/10 ✅

| Oblasť | Overené |
|--------|---------|
| Celý tok | registrácia → prihláška → `POST /api/ml/analyze` → CV a kontakt v Azure SQL |
| Bezpečnosť | cudzí uchádzač `403`, anonym `401`, neexistujúca prihláška `404`; `/api/internal` bez kľúča `403` |
| Kontakt | vzorové CV Martin Kovac → `name: "Martin Kovac"`, `phone: "+421 900 000 111"`, `hasCv: true` |
| CV | náhľad `inline` aj `?download=1`, stiahnuté bajty = nahrané; uchádzač `403`, anonym `401`, bez CV `404` |
| Poznámky | pridanie s orezaním medzier, autor `hr@firma.sk`, poradie; prázdna / 2001 znakov `400`; `404`; uchádzač `403` |
| Opakovaná analýza | CV sa nahradí |
| Migrácia | existujúca DB: nové stĺpce a tabuľky doplnené pri `docker compose up` |

Testovacie účty a dáta boli po teste zmazané.

## 13. Profil uchádzača a rozšírené pozície (2026-10-27)

### Profil

| Metóda | Cesta | Prístup | Telo | Odpoveď |
|--------|-------|---------|------|---------|
| POST | `/api/auth/register` | verejné | `{ email, password, fullName, phone? }` | `201 { user }` · `400` · `409` |
| PUT | `/api/auth/me` | prihlásený | `{ fullName, phone? }` | `200 { user }` · `400` |
| PUT | `/api/auth/me/password` | prihlásený | `{ currentPassword, newPassword }` | `204` · `400` zlé súčasné / slabé / rovnaké heslo |

`user = { id, email, role, fullName, phone }` (vracia ho aj `login` a `GET /me`).

- `fullName` povinné (2–200 znakov), `phone` voliteľný: 9–15 číslic, povolené `+ ( ) / -` a medzery.
- `PUT /me` je úplná náhrada – vynechaný telefón sa vymaže; email a rola sa nedajú zmeniť.
- Po zmene hesla dostane používateľ novú session (ostáva prihlásený).
- HR v `GET /api/admin/applications` vidí meno a telefón **z profilu**; ak ich uchádzač
  nevyplnil (staré účty), tak z CV.

### Pozícia – nové polia

Platí pre `POST` / `PUT /api/admin/jobs` (všetky voliteľné) a vracajú ich aj `GET /api/jobs`,
`GET /api/jobs/:id`, `GET /api/admin/jobs`:

| Pole | Hodnoty |
|------|---------|
| `location` | text, max. 200 |
| `employmentType` | `full_time` / `part_time` / `contract` (dohoda) / `internship` (stáž) |
| `workMode` | `onsite` / `hybrid` / `remote` |
| `salaryMin`, `salaryMax` | celé čísla 0–10 000 000, min ≤ max, mena EUR |
| `salaryPeriod` | `month` (default, ak je plat) / `year` / `hour`; bez platu `null` |
| `responsibilities` | náplň práce, text max. 10 000 |
| `benefits` | text max. 10 000 |
| `deadline` | `"RRRR-MM-DD"` – posledný deň na prihlásenie |
| `publishedAt` | iba na čítanie – nastaví sa pri prvom otvorení (`status: open`), potom sa nemení |

**Uzávierka:** po dni `deadline` (slovenský čas) pozícia zmizne z verejného katalógu,
`GET /api/jobs/:id` vráti `404` a nová prihláška `404`. Stav v DB ostáva `open`,
HR ju vidí v `GET /api/admin/jobs` ďalej. Katalóg je zoradený podľa `publishedAt`.

**Schéma:** `users.full_name`, `users.phone`; `jobs.location`, `employment_type`, `work_mode`,
`salary_min`, `salary_max`, `salary_period`, `responsibilities`, `benefits`, `published_at`,
`deadline` + CHECK constrainty. Migrácia je idempotentná; existujúce otvorené pozície dostali
`published_at`. Lokálny `seed.sql` dopĺňa mená testovacích účtov a údaje 3 pozícií.

**Test** (lokálny Docker, cez frontend proxy) – 10/10 ✅: validácia mena a telefónu pri
registrácii, profil v `login` / `me`, `PUT /me` (rola a email sa nedajú podvrhnúť), zmena hesla
(zlé / slabé / rovnaké → `400`, staré heslo prestane platiť, nová session), meno z profilu u HR,
nové polia pozície + 10 neplatných vstupov, `publishedAt` sa pri opätovnom otvorení nemení,
uzávierka dnes platí / včera skrytá a prihláška zamietnutá, zoradenie katalógu.
Testovacie dáta boli zmazané.
