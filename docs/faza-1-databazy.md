# Fáza 1 – Databázy

Cieľ: pripraviť dve databázy – cloudovú Azure SQL pre Backend 1 a lokálnu
kontajnerovú MySQL pre Backend 2.

## Checklist

- [x] **Azure SQL Database (Backend 1)**
  - [x] Inštancia Azure SQL Database
  - [x] Firewall (verejný prístup + Azure služby + IP vývojára)
  - [x] Connection string
  - [x] Schéma tabuliek `users`, `jobs`, `applications` nasadená v Azure
- [x] **MySQL (Backend 2)**
  - [x] Skript `init.sql` s tabuľkami `cv_analyses`, `match_scores`
  - [x] Otestované lokálne cez oficiálny image `mysql:8.0`

---

## 1. Azure SQL Database

### 1.1 Inštancia

Použitý je existujúci logický server v predplatnom *Azure for Students*:

| Parameter | Hodnota |
|-----------|---------|
| Server | `zadanie.database.windows.net` |
| Resource group | `aispupondelokcviko` |
| Región | Switzerland North |
| Databáza | `sqlzadanie` |
| Tier | Basic (5 DTU, max 2 GB) |
| Admin login | `Captain` (SQL autentifikácia) |

Ekvivalentné vytvorenie od nuly cez Azure CLI:

```bash
az sql server create -n zadanie -g aispupondelokcviko -l switzerlandnorth \
    --admin-user Captain --admin-password '<heslo>'
az sql db create -s zadanie -g aispupondelokcviko -n sqlzadanie --edition Basic
```

### 1.2 Firewall

Server mal pôvodne vypnutý verejný sieťový prístup. Nastavenie:

```bash
# zapnutie verejného prístupu
az sql server update -n zadanie -g aispupondelokcviko --enable-public-network true

# "Allow Azure services and resources to access this server"
az sql server firewall-rule create -s zadanie -g aispupondelokcviko \
    -n AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# verejná IP vývojára
az sql server firewall-rule create -s zadanie -g aispupondelokcviko \
    -n DevClient-Frantisek --start-ip-address <IP> --end-ip-address <IP>
```

| Pravidlo | Rozsah | Účel |
|----------|--------|------|
| `AllowAzureServices` | 0.0.0.0 – 0.0.0.0 | prístup z Azure služieb (App Service, Container Apps…) |
| `DevClient-Frantisek` | 95.103.62.8 | lokálny vývoj |

> Pri zmene verejnej IP (iná sieť) treba pridať nové pravidlo, inak spojenie
> skončí chybou *Client with IP address … is not allowed to access the server*.

### 1.3 Connection string

| Parameter | Hodnota |
|-----------|---------|
| Host | `zadanie.database.windows.net` |
| Port | `1433` |
| Databáza | `sqlzadanie` |
| User | `Captain` |
| Heslo | iba v `.env` (necommituje sa) |

Príklady formátov:

```text
# ADO.NET
Server=tcp:zadanie.database.windows.net,1433;Database=sqlzadanie;User ID=Captain;Password=<heslo>;Encrypt=True;TrustServerCertificate=False;

# ODBC (napr. Python pyodbc)
Driver={ODBC Driver 18 for SQL Server};Server=tcp:zadanie.database.windows.net,1433;Database=sqlzadanie;Uid=Captain;Pwd=<heslo>;Encrypt=yes;TrustServerCertificate=no;

# SQLAlchemy
mssql+pyodbc://Captain:<heslo>@zadanie.database.windows.net:1433/sqlzadanie?driver=ODBC+Driver+18+for+SQL+Server
```

### 1.4 Schéma

Súbor: [`database/azure-sql/schema.sql`](../database/azure-sql/schema.sql) (idempotentný).

```
users 1 ──── * applications * ──── 1 jobs
```

**users**

| Stĺpec | Typ | Pozn. |
|--------|-----|-------|
| id | INT IDENTITY | PK |
| email | NVARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | NVARCHAR(255) | NOT NULL – hash (napr. bcrypt), nikdy heslo |
| role | NVARCHAR(20) | `candidate` (default) / `hr` / `admin` |
| created_at | DATETIME2 | default `SYSUTCDATETIME()` (UTC) |

**jobs**

| Stĺpec | Typ | Pozn. |
|--------|-----|-------|
| id | INT IDENTITY | PK |
| title | NVARCHAR(200) | NOT NULL |
| department | NVARCHAR(100) | NOT NULL |
| description | NVARCHAR(MAX) | |
| requirements | NVARCHAR(MAX) | požadované zručnosti – vstup pre Backend 2 |
| status | NVARCHAR(20) | `draft` / `open` (default) / `closed` |

**applications**

| Stĺpec | Typ | Pozn. |
|--------|-----|-------|
| id | INT IDENTITY | PK |
| user_id | INT | FK → users.id, ON DELETE CASCADE |
| job_id | INT | FK → jobs.id, ON DELETE CASCADE, index |
| status | NVARCHAR(20) | `submitted` (default) / `reviewing` / `accepted` / `rejected` |
| created_at | DATETIME2 | default `SYSUTCDATETIME()` |

Dvojica `(user_id, job_id)` je UNIQUE – uchádzač sa na pozíciu prihlási len raz.

**Nasadenie:**

```powershell
powershell -File database\azure-sql\deploy.ps1
```

Skript načíta údaje z `.env`, spustí `schema.sql` cez `sqlcmd` a vypíše tabuľky.

> `deploy.ps1` obsahuje zámerne iba ASCII znaky. Windows PowerShell 5.1 číta UTF-8
> súbory bez BOM ako ANSI a slovenská diakritika (aj znak „–“) spôsobila chybu
> parsovania (`Unexpected token`, `The string is missing the terminator`).

**Overenie nasadenia (2026-10-14):**

| Test | Výsledok |
|------|----------|
| `sys.tables` | ✅ `applications`, `jobs`, `users` |
| Obmedzenia | ✅ 3× PK, 2× FK, 2× UNIQUE, 3× CHECK (spolu 10) |
| Opakované spustenie `deploy.ps1` | ✅ bez chyby, nič sa nezmenilo (idempotentné) |

---

## 2. MySQL (Backend 2)

### 2.1 Schéma

Súbor: [`database/mysql/init.sql`](../database/mysql/init.sql). Databáza `hr_analysis`,
kódovanie `utf8mb4` (slovenská diakritika v texte CV).

**cv_analyses**

| Stĺpec | Typ | Pozn. |
|--------|-----|-------|
| id | INT UNSIGNED AUTO_INCREMENT | PK |
| application_id | INT UNSIGNED | UNIQUE – jedna analýza na prihlášku |
| raw_text | LONGTEXT | extrahovaný text CV |
| skills_json | JSON | napr. `["python","sql"]` |
| experience_years | DECIMAL(4,1) | CHECK ≥ 0 |

**match_scores**

| Stĺpec | Typ | Pozn. |
|--------|-----|-------|
| id | INT UNSIGNED AUTO_INCREMENT | PK |
| application_id | INT UNSIGNED | index (môže byť viac prepočtov) |
| score_percentage | DECIMAL(5,2) | CHECK 0–100 |
| missing_skills_json | JSON | zručnosti, ktoré chýbajú |
| matched_skills_json | JSON | zručnosti, ktoré sedia |
| analyzed_at | DATETIME | default `CURRENT_TIMESTAMP` |

`application_id` odkazuje na `applications.id` v Azure SQL – bez FK (iná databáza).

### 2.2 Spustenie v Dockeri

[`docker-compose.yml`](../docker-compose.yml) používa oficiálny image `mysql:8.0`:

- `init.sql` je pripojený do `/docker-entrypoint-initdb.d/` → spustí sa **iba pri prvom
  štarte** (keď je volume prázdny),
- dáta sú v pomenovanom volume `mysql_data`,
- prihlasovacie údaje z `.env` (`MYSQL_ROOT_PASSWORD`, `MYSQL_USER`, `MYSQL_PASSWORD`),
- port `3306` (zmena cez `MYSQL_PORT`),
- healthcheck cez `mysqladmin ping` na 127.0.0.1.

```powershell
docker compose up -d                                   # štart
docker compose ps                                      # stav (healthy)
docker exec -it hr-mysql mysql -u hr_app -p hr_analysis
docker compose down                                    # stop (dáta ostanú)
docker compose down -v                                 # stop + zmazanie dát → init.sql sa spustí znova
```

> Po úprave `init.sql` treba `docker compose down -v`, inak sa zmena neprejaví.

### 2.3 Test (2026-10-14)

Spustené na Docker 29.1.3, MySQL Community Server 8.0.46:

| Test | Výsledok |
|------|----------|
| `init.sql` vykonaný pri štarte | ✅ v logu `running /docker-entrypoint-initdb.d/init.sql` |
| `SHOW TABLES` | ✅ `cv_analyses`, `match_scores` |
| INSERT + JOIN cez `application_id`, `JSON_LENGTH(skills_json)` | ✅ vráti 1 riadok, 2 zručnosti, skóre 66.67, `analyzed_at` doplnené |
| INSERT so `score_percentage = 150` | ✅ zamietnuté: `Check constraint 'ck_match_scores_score' is violated` |

Testovacie dáta boli následne zmazané.

---

## Bezpečnosť

- Heslá sú iba v `.env`, ktorý je v `.gitignore`. Do repa ide len `.env.example`.
- `deploy.ps1` predáva heslo cez `SQLCMDPASSWORD`, nie v argumentoch príkazu.
- Pravidlo `AllowAzureServices` povoľuje prístup zo **všetkých** Azure služieb (aj
  cudzích predplatných) – pre školský projekt OK, v produkcii by sa nahradilo
  private endpointom alebo konkrétnymi IP.
