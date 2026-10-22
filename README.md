# SmartRecruit AI – HR systém

HR systém pre správu pracovných pozícií a prihlášok s automatickou analýzou CV.
Uchádzač sa prihlási na pozíciu a nahrá životopis, systém ho pomocou NLP vyhodnotí
voči požiadavkám pozície a HR manažér vidí všetky prihlášky zoradené podľa zhody.

Školský projekt na predmet *Architektúra informačných systémov a prediktívna údržba*.

---

## Rýchle spustenie (pre každého v tíme)

Treba iba **Docker Desktop**. Node.js, Python ani Azure netreba.

1. Nainštaluj [Docker Desktop](https://www.docker.com/products/docker-desktop/) a spusti ho.
   - **Mac s čipom Apple (M1–M4):** v Docker Desktop zapni
     *Settings → General → Use Rosetta for x86_64/amd64 emulation* (SQL Server nemá ARM verziu).
   - **Windows:** Docker Desktop s WSL 2 (inštalátor to ponúkne sám).
2. Stiahni projekt (`git clone …` alebo cez VS Code) a otvor terminál v jeho hlavnom priečinku.
3. Vytvor konfiguračný súbor:
   ```bash
   cp .env.example .env              # Windows: copy .env.example .env
   ```
   V `.env` prepíš `SESSION_SECRET=<dlhy-nahodny-retazec>` na ľubovoľný dlhý text,
   napr. `SESSION_SECRET=smartrecruit-tajny-kluc-2026`. Ostatné môže ostať tak, ako je.
4. Spusti celý systém:
   ```bash
   docker compose up -d --build
   ```
   Prvé spustenie trvá 5–10 minút (sťahujú sa obrazy a jazykový model). Ďalšie sú rýchle.
5. Otvor **<http://localhost:5173>**.

### Testovacie účty

| Rola | Email | Heslo | Čo uvidí |
|------|-------|-------|----------|
| HR manažér (admin) | `hr@firma.sk` | `Admin1234` | Pozície + **HR prehľad** všetkých prihlášok |
| Uchádzač | `jan@test.sk` | `Heslo1234` | Pozície, detail pozície, prihláška s CV |

Ďalších uchádzačov si môžeš vytvoriť cez **Registráciu** (registrácia vždy vytvorí rolu uchádzač).
V databáze sú pripravené 3 pozície: *Junior Backend Developer*, *Data Analyst* a *DevOps Engineer*.

### Ako to vyskúšať

1. Prihlás sa ako `jan@test.sk`, otvor pozíciu, nahraj CV (PDF alebo DOCX, max. 5 MB),
   potvrď súhlas a odošli. Hneď uvidíš skóre zhody a splnené / chýbajúce zručnosti.
2. Odhlás sa, prihlás ako `hr@firma.sk` a otvor **HR prehľad**: prihlášky so skóre,
   filtre, zoradenie podľa zhody, detail analýzy a zmena stavu prihlášky.
3. Na jednu pozíciu sa dá jeden účet prihlásiť len raz. Na viac prihlášok si zaregistruj
   ďalších uchádzačov (napr. `martin@test.sk`, `lucia@test.sk`).
4. Vzorové CV sú v [`sample-data/cv/`](sample-data/cv/) – sú po anglicky, lebo NLP model je anglický:

   | Súbor | Kandidát | Očakávanie |
   |-------|----------|------------|
   | `CV-Martin-Kovac-backend.pdf` | backend developer, Java, SQL, Docker | vysoké skóre na Junior Backend Developer |
   | `CV-Lucia-Hornakova-data.pdf` | junior dátová analytička, Excel, Power BI | stredné skóre na Data Analyst |
   | `CV-Peter-Novak-uctovnik.pdf` | účtovník | nízke skóre na všetky pozície |

### Bežné príkazy

```bash
docker compose ps                        # stav kontajnerov
docker compose logs -f backend-1         # logy jednej služby (backend-2, frontend, mssql…)
docker compose up -d --build frontend    # po zmene kódu prestavať len frontend
docker compose stop                      # vypnúť, keď s projektom nepracuješ (dáta ostanú)
docker compose start                     # znova zapnúť
docker compose down -v                   # POZOR: zmaže aj databázy (pri ďalšom štarte sa vytvoria nanovo)
```

### Keď niečo nejde

| Problém | Riešenie |
|---------|----------|
| `hr-mssql` sa nespustí na Macu | zapni Rosetta v Docker Desktop (krok 1) a spusti znova |
| Stránka hlási chybu 500 / pozície sa nenačítajú | počkaj minútu, SQL Server štartuje pomaly; skontroluj `docker compose ps` a `docker compose logs mssql-init` |
| `Chýbajú premenné prostredia` v logu backend-1 | chýba `.env` alebo v ňom `SESSION_SECRET` |
| `mssql-init` padá s `\r: command not found` (Windows) | Git zmenil konce riadkov v `init.sh`; repozitár má `.gitattributes`, stačí `git rm --cached -r . && git reset --hard` alebo súbor uložiť s koncami riadkov LF |
| Port 5173, 3001, 3306 alebo 1433 je obsadený | vypni program, ktorý ho používa (napr. lokálny MySQL), alebo zmeň port v `docker-compose.yml` |
| Málo miesta na disku | Docker Desktop → *Troubleshoot → Clean / Purge data* |

---

## Architektúra

```
                         ┌──────────────────────────────┐
  prehliadač ──────────▶ │ frontend (React + nginx)     │  :5173
                         └──────┬───────────────┬───────┘
                       /api/*   │               │  /api/ml/*
                                ▼               ▼
              ┌──────────────────────┐   ┌──────────────────────┐
              │ backend-1            │   │ backend-2            │
              │ Node.js / Express    │   │ Python / FastAPI     │
              │ login, roly, pozície,│   │ analýza CV (spaCy),  │
              │ prihlášky   :3001    │   │ skóre zhody   :8000  │
              └──────────┬───────────┘   └──────────┬───────────┘
                         ▼                          ▼
              ┌──────────────────────┐   ┌──────────────────────┐
              │ SQL Server (hr_main) │   │ MySQL (hr_analysis)  │
              │ users, jobs,         │   │ cv_analyses,         │
              │ applications  :1433  │   │ match_scores  :3306  │
              └──────────────────────┘   └──────────────────────┘
```

| Kontajner | Port | Úloha |
|-----------|------|-------|
| `hr-frontend` | 5173 | React 18 + Vite, v Dockeri nginx; presmeruje `/api/ml` na Backend 2 a `/api` na Backend 1 |
| `hr-backend-1` | 3001 | Node.js / Express 5 – registrácia, login/logout (session cookie), roly `user` a `admin`, pozície, prihlášky, zmena stavu |
| `hr-backend-2` | 8000 | Python / FastAPI – parsovanie PDF/DOCX, spaCy NLP, skóre = 0,6 × pokrytie zručností + 0,4 × podobnosť textu ([dokumentácia API](http://localhost:8000/docs)) |
| `hr-mssql` | 1433 | SQL Server 2022 – lokálna náhrada Azure SQL (rovnaká `schema.sql`) |
| `hr-mysql` | 3306 | MySQL 8 pre Backend 2 |
| `mssql-init` | – | jednorazovo vytvorí databázu `hr_main`, schému a testovacie dáta, potom skončí (stav *Exited* je v poriadku) |

Databázy sú oddelené. Väzbu medzi nimi tvorí `application_id`: v MySQL odkazuje na
`applications.id` v SQL Serveri. Keďže ide o dve rôzne databázy, nie je to cudzí kľúč
a konzistenciu stráži aplikácia.

Frontend spája oba backendy: pri prihláške vytvorí záznam v Backende 1 a CV spolu
s požiadavkami pozície pošle do Backendu 2. HR prehľad načíta prihlášky z Backendu 1
a ku každej skóre z Backendu 2.

## Štruktúra projektu

```
AISPU---HR-system/
├── README.md                    – tento súbor
├── docker-compose.yml           – celý systém (5 kontajnerov + init)
├── .env.example                 – vzor konfigurácie (skopíruj ako .env)
├── docs/                        – podrobná dokumentácia fáz 1–3
├── backend-1/                   – Node.js/Express API (Dockerfile, src/)
├── backend-2/                   – Python/FastAPI analýza CV (Dockerfile, app/, tests/)
├── frontend/                    – React aplikácia (Dockerfile, nginx.conf, src/)
├── database/
│   ├── azure-sql/               – schema.sql (T-SQL) + deploy.ps1 pre Azure SQL
│   ├── mssql/                   – init.sh + seed.sql pre lokálny SQL Server v Dockeri
│   └── mysql/init.sql           – schéma pre MySQL (Backend 2)
└── sample-data/cv/              – vzorové CV na testovanie
```

## Vývoj bez Dockera (voliteľné, s Azure SQL)

```powershell
copy .env.example .env                     # doplň údaje k Azure SQL
docker compose up -d mysql                 # MySQL pre Backend 2
powershell -File database\azure-sql\deploy.ps1

cd backend-1; npm install; npm run dev     # http://localhost:3001/health
cd backend-2
python -m venv .venv; .venv\Scripts\activate
pip install -r requirements.txt; python -m spacy download en_core_web_sm
uvicorn app.main:app --reload --port 8000  # http://localhost:8000/docs
cd frontend; npm install; npm run dev      # http://localhost:5173
```

## Stav projektu

| Časť | Stav | Dokumentácia |
|------|------|--------------|
| Databázy (Azure SQL / SQL Server + MySQL) | ✅ hotové | [docs/faza-1-databazy.md](docs/faza-1-databazy.md) |
| Backend 1 (Node.js, login, 2 roly, sessions) | ✅ hotové | [docs/faza-2-backend-1.md](docs/faza-2-backend-1.md) |
| Backend 2 (FastAPI, NLP analýza CV) | ✅ hotové | [docs/faza-3-backend-2.md](docs/faza-3-backend-2.md) |
| Frontend (React, spája oba backendy) | ✅ hotové, prebieha vizuálny redizajn | [frontend/README.md](frontend/README.md) |
| Docker nasadenie (5 kontajnerov) | ✅ hotové | táto stránka |
| Vzorové CV na testovanie | 🟡 3 ukážkové, treba 10–15 s označením vhodný / nevhodný | [sample-data/cv/](sample-data/cv/) |
| BPMN (60 činností, 2 bazény, 3 dráhy, podproces) | ❌ chýba | – |
| Trénovaný ML model | ❌ chýba (teraz je NLP + pravidlové skóre, nič sa netrénuje) | – |

### Čo ešte chýba v aplikácii

- **Moje prihlášky** pre uchádzača – po odoslaní nevidí stav prihlášky (chýba `GET /api/applications/mine` + obrazovka).
- **Správa pozícií pre HR** – pozície sa dajú pridať len cez SQL (chýba `POST/PUT /api/admin/jobs` + obrazovka).
- **Váhy zručností** – Backend 2 berie `requirements` len ako pole reťazcov, všetky zručnosti majú rovnakú váhu.
- **Uloženie GDPR súhlasu** – checkbox je vo formulári, ale neukladá sa (napr. stĺpec `applications.consent_at`).
- *(voliteľné)* História zmien stavu prihlášky.
