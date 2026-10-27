# Fáza 3 – Backend 2 (Python / FastAPI, ML & NLP)

Backend 2 analyzuje životopisy: vytiahne z CV text, rozpozná zručnosti, vzdelanie
a dĺžku praxe a vypočíta percentuálnu zhodu s požiadavkami pozície. Výsledky
ukladá do MySQL z [fázy 1](faza-1-databazy.md) (lokálny Docker kontajner).

## Checklist

- [x] **Inicializácia projektu**
  - [x] Python prostredie (`.venv`) + `fastapi`, `uvicorn`, `pydantic`, `mysql-connector-python`,
        `spacy`, `scikit-learn`, `pypdf`, `python-multipart` (+ `python-docx` na DOCX)
  - [x] Jazykový model `en_core_web_sm`
- [x] **Dátová vrstva (MySQL)** – connection pool + mapper na `cv_analyses` a `match_scores`
- [x] **ML/NLP modul**
  - [x] Parser PDF / DOCX
  - [x] Predspracovanie – čistenie, tokenizácia, lemmatizácia (spaCy)
  - [x] Extrakcia entít – zručnosti, vzdelanie, dĺžka praxe
  - [x] Match Score – TF vektorizácia + kosínusová podobnosť
- [x] **API** – `POST /api/ml/analyze`, `GET /api/ml/results/{application_id}`
- [x] **CORS** pre frontend

---

## 1. Inštalácia a spustenie

```powershell
cd backend-2
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm

docker compose up -d                          # MySQL (z koreňa projektu)
uvicorn app.main:app --reload --port 8000     # vývoj
python -m pytest                              # testy
```

Interaktívna dokumentácia API (Swagger): <http://localhost:8000/docs>

Požiadavka: Python ≥ 3.11 (vyvíjané na 3.13.14).

| Balík | Verzia | Účel |
|-------|--------|------|
| `fastapi` | 0.146 | HTTP API, validácia, Swagger |
| `uvicorn` | 0.54 | ASGI server |
| `pydantic` | 2.14 | modely odpovedí |
| `python-multipart` | 0.0.32 | príjem súboru (multipart/form-data) |
| `mysql-connector-python` | 26.7 | ovládač MySQL, connection pool |
| `spacy` + `en_core_web_sm` | 3.8 | tokenizácia, lemmatizácia, NER |
| `scikit-learn` | 1.9 | `TfidfVectorizer`, `cosine_similarity` |
| `pypdf` | 6.21 | text z PDF |
| `python-docx` | 1.2 | text z DOCX (nebol v zadaní, ale DOCX parser ho potrebuje) |
| `python-dotenv` | 1.2 | načítanie `.env` |
| `pytest`, `httpx` | | testy |

## 2. Štruktúra

```
backend-2/
├── requirements.txt
├── pytest.ini
├── app/
│   ├── main.py            – FastAPI aplikácia, CORS, /health, načítanie modelu pri štarte
│   ├── config.py          – premenné prostredia
│   ├── db.py              – MySQL connection pool, ping, doplnenie stĺpcov
│   ├── repository.py      – mapper: uloženie / načítanie analýzy
│   ├── schemas.py         – Pydantic modely odpovedí
│   ├── routers/
│   │   └── ml.py          – /api/ml/analyze, /api/ml/results/{id}
│   └── nlp/
│       ├── parser.py      – PDF / DOCX -> text
│       ├── preprocess.py  – spaCy pipeline, čistenie, tokeny pre vektorizáciu
│       ├── skills.py      – slovník zručností a titulov
│       ├── extract.py     – zručnosti, vzdelanie, prax
│       ├── matcher.py     – kosínusová podobnosť + výsledné skóre
│       └── pipeline.py    – celé spracovanie jedného CV
└── tests/
    ├── conftest.py        – generovanie testovacích PDF / DOCX
    ├── test_nlp.py        – NLP modul
    └── test_api.py        – API (repozitár v pamäti)
```

## 3. Konfigurácia

Číta sa spoločný `.env` v koreni projektu (rovnako ako Backend 1).

| Premenná | Povinná | Default | Popis |
|----------|:-------:|---------|-------|
| `MYSQL_HOST` | ✅ | – | `localhost` |
| `MYSQL_PORT` | | `3306` | |
| `MYSQL_DATABASE` | | `hr_analysis` | |
| `MYSQL_USER` | ✅ | – | aplikačný používateľ (nie root) |
| `MYSQL_PASSWORD` | ✅ | – | |
| `CORS_ORIGIN` | | `http://localhost:5173` | spoločné s Backendom 1; viac adries oddeľ čiarkou |
| `BACKEND2_PORT` | | `8000` | |
| `MAX_UPLOAD_MB` | | `5` | max. veľkosť CV |

## 4. Dátová vrstva (MySQL)

- **Connection pool** (5 spojení), všetky hodnoty idú ako parametre `%s`, takže
  SQL injection nie je možná.
- **Mapper** [`repository.py`](../backend-2/app/repository.py):
  - `cv_analyses` – 1 riadok na prihlášku; pri opakovanej analýze sa prepíše
    (`INSERT … ON DUPLICATE KEY UPDATE`),
  - `match_scores` – história, každá analýza je nový riadok; `GET` vracia poslednú,
  - oba zápisy bežia v jednej transakcii.
- **Nové stĺpce** (fáza 3): `cv_analyses.education_json`, `match_scores.text_similarity`,
  `match_scores.skill_coverage`. Sú v [`init.sql`](../database/mysql/init.sql) pre nový
  kontajner. Keďže `init.sql` beží iba pri prvom štarte kontajnera, do existujúcej
  databázy ich doplní aplikácia pri štarte (`db.ensure_schema()`).

## 5. ML / NLP modul

### 5.1 Parser ([`parser.py`](../backend-2/app/nlp/parser.py))

- Typ súboru sa overuje podľa **obsahu** (`%PDF-` / `PK` zip) aj prípony, nielen podľa názvu.
- PDF: `pypdf`, text všetkých strán. Zaheslované PDF sa odmietne.
- DOCX: `python-docx`, odseky **aj tabuľky** (zručnosti bývajú v tabuľke).
- Naskenované CV (obrázok bez textu) → `422` s vysvetlením (OCR nie je súčasťou).

### 5.2 Predspracovanie ([`preprocess.py`](../backend-2/app/nlp/preprocess.py))

1. **Čistenie:** Unicode NFKC, odstránenie URL a emailov, zjednotenie medzier
   a pomlčiek. Riadky sa zachovajú, lebo extrakcia praxe pracuje po riadkoch.
2. **spaCy pipeline** `en_core_web_sm` + **EntityRuler** vložený pred štatistické NER.
3. **Tokeny pre model zhody:** lemma malými písmenami, bez stop-slov, interpunkcie
   a čísel. Každá rozpoznaná zručnosť je jeden token s kanonickým názvom
   (`Node.js`, `nodejs` aj `Node` → `skill:node.js`).

### 5.3 Extrakcia entít ([`extract.py`](../backend-2/app/nlp/extract.py), [`skills.py`](../backend-2/app/nlp/skills.py))

| Entita | Ako |
|--------|-----|
| **Zručnosti** | EntityRuler, label `SKILL`, ~80 technológií s variantmi zápisu (`k8s` → `kubernetes`, `t-sql` → `sql server`). Slová, ktoré sú zároveň bežnými slovami (`React`, `Excel`, `Go`, `C`), sa hľadajú iba s presnou veľkosťou písmen, takže „I react quickly“ ani „excel at teamwork“ zručnosť nie sú. |
| **Vzdelanie** | EntityRuler, label `DEGREE`: `phd / master / bachelor / high school` vrátane slovenských titulov (`Ing.`, `Mgr.`, `Bc.`, `PhD.`). Školy zo spaCy NER (`ORG`) a z riadkov s „University / Univerzita / Fakulta…“. |
| **Prax** | 1) explicitná zmienka „5+ years“, „4 roky“ (berie sa najväčšia); 2) inak súčet období „2018 - 2021“, „03/2019 - present“, pričom prekrývajúce sa obdobia sa zlúčia a riadky so štúdiom sa preskočia. |

### 5.4 Match Score ([`matcher.py`](../backend-2/app/nlp/matcher.py))

```
score = 0.6 × skill_coverage + 0.4 × text_similarity
```

- **`text_similarity`** – `TfidfVectorizer` (unigramy + bigramy z tokenov z 5.2)
  a `cosine_similarity` medzi požiadavkami a CV.
  Používa sa `use_idf=False, sublinear_tf=True`. IDF naučené iba na dvoch
  dokumentoch by totiž znížilo váhu práve tých slov, ktoré sú v oboch textoch
  (= zhoda), a podobnosť by vychádzala nižšia.
- **`skill_coverage`** – podiel požadovaných zručností, ktoré CV obsahuje.
  Samotná kosínusová podobnosť dlhého CV a krátkeho inzerátu je nízka
  (typicky 10–30 %), preto rozhoduje hlavne pokrytie zručností.
- Ak v požiadavkách nie je žiadna rozpoznaná zručnosť, `score = text_similarity`.

**Požiadavky** majú rovnaké formáty ako `jobs.requirements` v Azure SQL:

| Formát | Príklad | Pokrytie zručností |
|--------|---------|--------------------|
| voľný text | `"Java, SQL, 2 roky praxe"` | zručnosti nájdené v texte, každá rovnakú váhu |
| pole zručností | `["Java", "SQL"]` | každá zručnosť rovnakú váhu |
| pole s váhami | `[{"skill":"Java","weight":70}, {"skill":"SQL","weight":30}]` | súčet váh nájdených / súčet všetkých váh |

Príklad s váhami: CV obsahuje Javu, ale nie SQL → `skill_coverage = 70 %`
(bez váh by to bolo 50 %). Ak položka obsahuje viac zručností („Docker and Kubernetes“),
jej váha sa medzi ne rozdelí rovnakým dielom. Pri váhach sa berú iba zručnosti z poľa
(ďalšie nájdené v texte by nemali váhu). Položka, ktorú slovník nepozná (napr.
`"team leadership"`), sa berie ako vlastná zručnosť a v CV sa hľadá ako fráza.

> **Obmedzenie:** model `en_core_web_sm` je anglický. Technológie a slovenské
> tituly sa rozpoznajú aj v slovenskom CV, ale lemmatizácia a NER fungujú
> najlepšie na anglickom texte.

## 6. API

### `POST /api/ml/analyze`

`multipart/form-data`:

| Pole | Typ | Popis |
|------|-----|-------|
| `file` | súbor | CV, PDF alebo DOCX, max. 5 MB |
| `application_id` | int > 0 | `applications.id` z Azure SQL |
| `requirements` | text (1–20 000 znakov) | požiadavky pozície – text, JSON pole alebo pole s váhami (5.4) |

Odpoveď `201`:

```json
{
  "application_id": 1,
  "score_percentage": 39.03,
  "text_similarity": 11.86,
  "skill_coverage": 57.14,
  "matched_skills": ["node.js", "typescript", "react", "docker"],
  "missing_skills": ["kubernetes", "aws", "team leadership"],
  "cv_skills": ["rest api", "node.js", "express", "typescript", "docker", "sql server", "python", "..."],
  "education": {
    "degrees": ["master"],
    "institutions": ["Technical University of Kosice", "Faculty of Electrical Engineering"]
  },
  "experience_years": 9.0,
  "analyzed_at": "2026-10-19T08:17:37"
}
```

Chyby: `413` súbor je príliš veľký · `415` iný typ súboru · `422` chýbajúce alebo
neplatné pole, prázdny, poškodený alebo naskenovaný súbor.

```powershell
curl.exe -X POST http://localhost:8000/api/ml/analyze `
  -F "file=@cv.pdf" -F "application_id=1" `
  -F 'requirements=["Node.js","TypeScript","Kubernetes"]'
```

### `GET /api/ml/results/{application_id}`

`200` – rovnaký formát ako vyššie (posledná analýza) · `404` analýza neexistuje.

### `GET /health`

`200 {"status":"ok","database":"connected"}`, pri výpadku MySQL `503`.

### CORS

Povolené iba `CORS_ORIGIN`, metódy `GET` a `POST`, `allow_credentials=True`.

> **Bezpečnosť:** Backend 2 nemá vlastné prihlasovanie (session je v Backende 1).
> Pri nasadení mimo lokálneho počítača treba endpointy chrániť, napr. volať ich
> iba z Backendu 1 alebo zdieľaným API kľúčom.

## 7. Test (2026-10-19)

**Automatické testy** `python -m pytest` – 24/24 ✅ (testovacie PDF a DOCX sa generujú v kóde):

| Oblasť | Overené |
|--------|---------|
| Parser | PDF, DOCX vrátane tabuliek, odmietnutie `.txt` / zlej prípony / poškodeného súboru |
| Predspracovanie | čistenie (NBSP, pomlčky, email, URL), lemmy, zjednotenie `NodeJS` = `Node.js` |
| Zručnosti | 14 zručností z ukážkového CV; „react quickly“ a „excel at“ nie sú zručnosti |
| Vzdelanie | `Ing.` → master, `Bc.` + `Ph.D.` → phd + bachelor, názov univerzity bez rokov |
| Prax | 9 rokov z období (štúdium 2011–2016 sa nepočíta), explicitné „5+ years“, prekryv období |
| Zhoda | kosínus 0..1, pokrytie, výsledné skóre, JSON pole s vlastnou zručnosťou |
| API | `201` + `GET` vráti to isté, DOCX, `404`, `413`, `415`, `422`, CORS povolený / cudzí origin |

**Proti reálnej MySQL** (kontajner `hr-mysql` s databázou z fázy 1):

| Test | Výsledok |
|------|----------|
| Štart | ✅ `Pripojené na MySQL (localhost:3306/hr_analysis)`, nové stĺpce doplnené |
| `GET /health` | ✅ `200` |
| `POST /api/ml/analyze` (PDF) | ✅ `201`, skóre 39,03 %, riadky v `cv_analyses` aj `match_scores` |
| `GET /api/ml/results/1` | ✅ rovnaké dáta z DB; neexistujúce ID → `404` |
| Opakovaná analýza | ✅ `cv_analyses` 1 riadok (prepísaný), `match_scores` 2 riadky (história), `GET` vráti novší |

Testovacie riadky boli po teste z databázy zmazané.

## 8. Váhy zručností (2026-10-24)

`requirements` vo formáte `[{"skill":"java","weight":30}, …]` sa už nespracúva ako
obyčajný text – váhy určujú `skill_coverage` (pozri 5.4). Zmeny:
[`pipeline.py`](../backend-2/app/nlp/pipeline.py) (`parse_requirements` vracia aj váhy),
[`matcher.py`](../backend-2/app/nlp/matcher.py) (`skill_match` s váhami). Formát odpovede API
sa nemenil, frontend netreba upravovať.

Testy `python -m pytest` – 28/28 ✅ (nové: parsovanie váh, neplatné položky → text,
vážené pokrytie 60 %, celé CV s váhami 80 % vs. bez váh 66,67 %, delenie váhy viacerých zručností).

## 9. Meno, telefón a odovzdanie CV do Backendu 1 (2026-10-27)

**Kontakt z CV** ([`nlp/contact.py`](../backend-2/app/nlp/contact.py)) – heuristika:

| Údaj | Ako |
|------|-----|
| Meno | spaCy `PERSON` v prvých 6 riadkoch, inak prvý riadok v tvare 2–4 slov s veľkým začiatočným písmenom (anglický model slovenské mená často nespozná). Riadky „Curriculum Vitae“, „Životopis“… sa preskočia. |
| Telefón | 9–15 číslic; prednosť má číslo pri „Tel / Phone / Mobil“, potom s predvoľbou `+`. Obdobia `2018 - 2021` a dátumy `03/2019` sa vynechajú. |

Na 3 vzorových CV v `sample-data/cv/` sú meno aj telefón rozpoznané správne.

**Odovzdanie CV** ([`backend1.py`](../backend-2/app/backend1.py)) – po analýze sa súbor
(base64), meno a telefón pošlú na `PUT {BACKEND1_URL}/api/internal/applications/{id}/cv`
s hlavičkou `X-Internal-Key` a preposlanou cookie `hr.sid`. Analýza sa do MySQL uloží
**až keď Backend 1 CV prijme**:

| Backend 1 vráti | `POST /api/ml/analyze` vráti |
|-----------------|------------------------------|
| `204` | `201` + analýza |
| `401` / `403` / `404` (cudzia / neexistujúca prihláška) | rovnaký kód, analýza sa neuloží |
| `5xx` alebo nedostupný | `502` |
| `INTERNAL_API_KEY` nie je nastavený | CV sa neposiela, analýza normálne (lokálny vývoj) |

Nové premenné: `INTERNAL_API_KEY` (rovnaký ako v Backende 1), `BACKEND1_URL`
(default `http://localhost:3001`, v Dockeri `http://backend-1:3001`). `httpx` sa presunul
z testovacích závislostí medzi bežné.

Testy `python -m pytest` – 51/51 ✅ (nové: 16 na meno a telefón, klient Backendu 1 –
hlavičky, cookie, base64, chyby 404 / 500 / nedostupnosť, a API – odovzdanie CV,
odmietnutie zastaví uloženie analýzy).

## 10. Názvy zručností a synonymá (2026-10-27)

**Pôvodné názvy** – `matched_skills`, `missing_skills` a `cv_skills` sa už nevracajú
malými písmenami. Zručnosť z poľa požiadaviek sa vráti presne tak, ako ju napísal HR
(`"REST API"`, `"Kubernetes (k8s)"`), ostatné podľa `DISPLAY` v
[`skills.py`](../backend-2/app/nlp/skills.py) (`JavaScript`, `PostgreSQL`, `CI/CD`).
Porovnáva sa ďalej podľa interných kľúčov, výpočet skóre sa nezmenil. Analýzy uložené
pred touto zmenou majú v MySQL staré názvy, kým sa CV neanalyzuje znova.

**Synonymá** – slovník má teraz ~90 zručností. Pribudli varianty zápisu (`ES6`, `psql`,
`Docker Compose`, `GitHub Actions` → CI/CD, `Ubuntu` → Linux…), slovenské výrazy
(`analýza dát`, `strojové učenie`, `objektovo orientované programovanie`, `anglický jazyk`…)
a nové zručnosti: Databázy, Testovanie softvéru, Riadenie projektov, Komunikácia,
Tímová práca, Účtovníctvo. Slovenské výrazy sú v základnom tvare a najčastejších pádoch –
anglický model slovenčinu nelematizuje.

**Overenie podobnosti textu** (podnet „40 % = váha“): hodnota sa naozaj počíta, 40 % bola
náhoda. Pre tie isté požiadavky vyšlo 6,6 % / 22,5 % / 2,5 % na troch vzorových CV.
**Známy problém:** frontend posiela ako `requirements` iba zoznam zručností, takže kosínusová
podobnosť meria hustotu týchto slov v CV – krátke CV (10 slov) dostalo 80 %, rovnaké CV so
101 slovami 31 %. Úpravu modelu podobnosti (embedding, porovnanie s celým inzerátom) rieši
iný člen tímu.

Testy `python -m pytest` – 74/74 ✅ (nové: zobrazované názvy z poľa aj z voľného textu,
`DISPLAY` pre každú zručnosť, 17 synoným, žiadne falošné zhody na bežnom texte).
