# AISPU – HR systém

HR systém pre správu pracovných pozícií a prihlášok s automatickou analýzou CV.

## Architektúra

| Komponent | Úloha | Databáza |
|-----------|-------|----------|
| **Backend 1** | Používatelia, pracovné pozície, prihlášky | Azure SQL Database (cloud) |
| **Backend 2** | Analýza CV a výpočet zhody s pozíciou | MySQL 8.0 (lokálny Docker kontajner) |

Databázy sú oddelené. Väzbu medzi nimi tvorí `application_id`: v MySQL odkazuje na
`applications.id` v Azure SQL. Keďže ide o dve rôzne databázy, nie je to cudzí kľúč
a konzistenciu stráži aplikácia.

## Štruktúra projektu

```
AISPU---HR-system/
├── README.md                    – tento súbor (prehľad + stav projektu)
├── docs/
│   ├── faza-1-databazy.md       – fáza 1: databázy
│   ├── faza-2-backend-1.md      – fáza 2: Backend 1
│   └── faza-3-backend-2.md      – fáza 3: Backend 2 (ML/NLP)
├── backend-1/                   – Node.js/Express API nad Azure SQL
│   ├── package.json
│   ├── scripts/                 – create-admin.js
│   └── src/                     – server, app, config, db, middleware, routes
├── backend-2/                   – Python/FastAPI analýza CV nad MySQL
│   ├── requirements.txt
│   ├── app/                     – API, MySQL mapper, NLP modul
│   └── tests/                   – pytest
├── database/
│   ├── azure-sql/
│   │   ├── schema.sql           – T-SQL schéma pre Azure SQL (Backend 1)
│   │   └── deploy.ps1           – nasadenie schémy cez sqlcmd
│   └── mysql/
│       └── init.sql             – schéma pre MySQL (Backend 2)
├── docker-compose.yml           – lokálny MySQL kontajner
├── .env.example                 – vzor konfigurácie (skopíruj ako .env)
└── .gitignore
```

## Rýchly štart

```powershell
# 1. Konfigurácia
copy .env.example .env          # doplň heslá

# 2. Lokálna MySQL (Backend 2)
docker compose up -d
docker exec -it hr-mysql mysql -u hr_app -p hr_analysis

# 3. Schéma v Azure SQL (Backend 1)
powershell -File database\azure-sql\deploy.ps1

# 4. Backend 1
cd backend-1; npm install; npm run dev   # http://localhost:3001/health

# 5. Backend 2
cd backend-2
python -m venv .venv; .venv\Scripts\activate
pip install -r requirements.txt; python -m spacy download en_core_web_sm
uvicorn app.main:app --reload --port 8000   # http://localhost:8000/docs
```

## Stav projektu

| Fáza | Popis | Stav | Dokumentácia |
|------|-------|------|--------------|
| 1 | Databázy (Azure SQL + MySQL) | ✅ hotová | [docs/faza-1-databazy.md](docs/faza-1-databazy.md) |
| 2 | Backend 1 (Node.js + Azure SQL) | API hotové – čaká na test s reálnou DB | [docs/faza-2-backend-1.md](docs/faza-2-backend-1.md) |
| 3 | Backend 2 (FastAPI + NLP + MySQL) | ✅ hotová | [docs/faza-3-backend-2.md](docs/faza-3-backend-2.md) |
