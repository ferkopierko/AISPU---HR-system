# Dva frontendy a sessions

SmartRecruit AI má dve webové aplikácie pre dve skupiny používateľov. Obe bežia vo vlastnom
kontajneri a používajú tie isté dva backendy.

| Portál | Adresa (Docker) | Pre koho | Obsah |
|---|---|---|---|
| Portál uchádzača | <http://localhost:5173> | rola `user` | pozície, detail a prihláška s CV, Moje prihlášky, profil, prihlásenie, registrácia |
| HR portál | <http://localhost:5174> | roly `admin`, `sysadmin` | prihlášky, správa pozícií, správa používateľov (iba `sysadmin`), profil, prihlásenie |

## Prečo dva portály

- **Oddelenie podľa používateľov.** Uchádzač a HR manažér majú úplne iné úlohy. Uchádzač nemá
  v prehliadači ani kód HR obrazoviek: každý portál sa zostaví len so svojou aplikáciou.
- **Menšia plocha útoku.** Prihlásenie do HR portálu povolí Backend 1 iba HR účtom a HR
  endpointy prijmú iba session vytvorenú v HR portáli. Ukradnutá alebo zneužitá session
  uchádzača sa k HR funkciám nedostane, ani keby účet medzičasom dostal vyššiu rolu.
- **Samostatné nasadenie a škálovanie.** Každý portál je samostatná služba
  (`frontend`, `frontend-hr` v Dockeri, dve App Service na Azure), dá sa samostatne
  reštartovať, aktualizovať alebo presunúť na inú doménu.
- **Jeden kód.** Komponenty, volania API, štýly aj texty sú spoločné, nič sa nekopíruje.

## Jeden kód, dve aplikácie

```
frontend/src/
├── main.jsx               vyberie aplikáciu podľa VITE_APP (candidate | hr)
├── apps/CandidateApp.jsx  routy a navigácia portálu uchádzača
├── apps/HrApp.jsx         routy a navigácia HR portálu (/applications, /jobs, /users, /profile)
├── portal.js              ktorý portál beží, adresy oboch portálov
├── components/, pages/    spoločné obrazovky (Layout dostane navigáciu ako parameter)
└── api.js, labels.js, styles.css
```

`VITE_APP` sa nastaví pri zostavení (Dockerfile: `--build-arg APP=hr`). Vite ho nahradí
konštantou, takže druhá aplikácia sa do výsledného súboru vôbec nedostane.

## Oddelené cookies

Prehliadač **nerozlišuje porty**: cookie nastavená pre `localhost:5173` sa posiela aj na
`localhost:5174`. Pôvodne mal Backend 1 jednu cookie `hr.sid`, takže prihlásenie HR v tom
istom prehliadači odhlásilo uchádzača (a naopak).

Teraz každý portál pri každej požiadavke na backend pridá hlavičku `X-Client-App`. Pridáva ju
proxy portálu (nginx v Dockeri, `frontend/azure/server.js` na Azure, Vite pri vývoji) a hodnotu
od prehliadača vždy prepíše. Backend 1 podľa nej použije inú cookie:

| `X-Client-App` | Cookie | Kto sa smie prihlásiť |
|---|---|---|
| `candidate` | `sr.candidate.sid` | iba `user` (inak 403 „HR účty sa prihlasujú v HR portáli“) |
| `hr` | `sr.hr.sid` | iba `admin`, `sysadmin` (inak 403 „Tento účet nemá prístup do HR portálu“) |
| chýba | prihlásenie aj registrácia vrátia 400 | – |

```
prehliadač ── cookie sr.candidate.sid ──▶ nginx :5173 ── X-Client-App: candidate ──▶ Backend 1
prehliadač ── cookie sr.hr.sid ─────────▶ nginx :5174 ── X-Client-App: hr ─────────▶ Backend 1
```

Obe cookies sú v prehliadači naraz, každý portál používa svoju. Odhlásenie zmaže iba cookie
toho portálu. Pri prihlásení sa do session zapíše aj portál (`clientApp`). `requireRole`
pustí HR a správcovské endpointy iba so session z HR portálu.

### Backend 2 a meno cookie

Backend 2 overuje prístup k analýze tak, že session cookie pošle do interného API Backendu 1
(`/api/internal/...`). Robí to pod pevným menom `hr.sid`. Aby sa Backend 2 nemusel meniť,
proxy portálu pri volaniach `/api/ml/*` premenuje cookie portálu na `hr.sid`. Backend 1
pri požiadavkách bez `X-Client-App` (iba interné volania z Backendu 2) číta práve `hr.sid`.
Všetky tri názvy cookies ukazujú do toho istého úložiska sessions, takže ide o tú istú session.

## Kde sú uložené sessions

Predtým boli sessions iba v pamäti procesu Backendu 1. Po reštarte kontajnera sa všetci
odhlásili a dve inštancie Backendu 1 by o sebe nevedeli.

Teraz sú v tabuľke **`dbo.sessions`** v SQL Serveri (lokálne kontajner `hr-mssql`, na Azure
Azure SQL), definovanej v [`database/azure-sql/schema.sql`](../database/azure-sql/schema.sql):

| Stĺpec | Obsah |
|---|---|
| `sid` | ID session (v cookie je podpísané kľúčom `SESSION_SECRET`) |
| `session` | JSON: `userId`, `role`, `clientApp`, nastavenia cookie |
| `expires` | čas vypršania (UTC), 8 hodín od prihlásenia |

Úložisko je v [`backend-1/src/db/sessionStore.js`](../backend-1/src/db/sessionStore.js)
(rozšírenie `express-session`, bez ďalšej knižnice). Výber cookie podľa portálu je
v [`backend-1/src/middleware/session.js`](../backend-1/src/middleware/session.js).
Exspirované sessions sa pri čítaní ignorujú a každých 15 minút sa z tabuľky zmažú.

Výsledok: `docker compose restart backend-1` nikoho neodhlási a pri viacerých inštanciách
Backendu 1 (škálovanie na Azure) platí session v ktorejkoľvek z nich.

## Bezpečnosť

- `X-Client-App` vyberá iba cookie a portál, oprávnenia nedáva. Aj keby ju niekto poslal
  priamo na verejnú adresu Backendu 1, do HR portálu sa prihlási iba účet s HR rolou.
- Cookies sú `httpOnly`, `sameSite: lax`, v produkcii `Secure`.
- Pri prihlásení a zmene hesla vzniká nové ID session (ochrana pred session fixation).
- Rola sa pri každej požiadavke znova načíta z databázy, takže odobratá rola platí hneď.

## Spustenie

```bash
docker compose up -d --build    # uchádzač :5173, HR :5174
```

Vývoj bez Dockera (backendy bežia na 3001 a 8000):

```bash
cd frontend
npm run dev      # portál uchádzača, :5173
npm run dev:hr   # HR portál, :5174
```
