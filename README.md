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
│   └── faza-1-databazy.md       – detailná dokumentácia fázy 1
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
```

## Stav projektu

| Fáza | Popis | Stav | Dokumentácia |
|------|-------|------|--------------|
| 1 | Databázy (Azure SQL + MySQL) | ✅ hotová | [docs/faza-1-databazy.md](docs/faza-1-databazy.md) |
