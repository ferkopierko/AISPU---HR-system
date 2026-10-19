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
| POST | `/api/applications` | prihlásený | `{ jobId }` | `201 { application }` · `404` pozícia · `409` už prihlásený |

`job = { id, title, department, description, requirements, status }`

Prihláška sa priradí používateľovi **zo session** – `userId` v tele sa ignoruje.

### Obrazovka 2 – HR Admin Dashboard (iba `admin`)

| Metóda | Cesta | Telo | Odpoveď |
|--------|-------|------|---------|
| GET | `/api/admin/applications?status=&jobId=` | – | `200 { applications: [...] }` (filtre voliteľné) |
| PATCH | `/api/admin/applications/:id/status` | `{ status }` | `200 { application: { id, status } }` · `400` · `404` |

Povolené hodnoty pre PATCH: `reviewing`, `interview` (pozvaný na pohovor),
`accepted`, `rejected` (zamietnutý).

Položka zoznamu:

```json
{
  "id": 1,
  "status": "submitted",
  "createdAt": "2026-10-19T10:00:00.000Z",
  "candidate": { "id": 3, "email": "jan@test.sk" },
  "job": { "id": 1, "title": "Backend vývojár", "department": "IT" }
}
```

### Príklad (PowerShell)

```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$api = 'http://localhost:3001/api'
Invoke-RestMethod "$api/auth/register" -Method Post -WebSession $s -ContentType 'application/json' -Body '{"email":"jan@test.sk","password":"heslo1234"}'
Invoke-RestMethod "$api/jobs" -WebSession $s
Invoke-RestMethod "$api/applications" -Method Post -WebSession $s -ContentType 'application/json' -Body '{"jobId":1}'
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
