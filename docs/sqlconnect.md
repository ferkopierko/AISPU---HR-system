# Analýzy CV v PostgreSQL cez Firebase SQL Connect

## Overený stav – 2. 11. 2026

- Schéma a konektor sú publikované v online projekte. Zdroj už nie je dočasný:
  serverové metadáta potvrdili `ephemeral=false` a pripojený Cloud SQL PostgreSQL.
- Prenesených a porovnaných bolo všetkých **5 analýz a 5 historických hodnotení**.
  Opakovaný migračný náhľad overil všetkých päť existujúcich cieľov bez prepisovania.
- Aplikácia na tomto počítači používa SQL Connect aj cez obyčajné
  `docker compose up -d`: súkromný `.env` nastavuje príslušný `COMPOSE_FILE`.
- Živá kontrola: oba backendy aj frontend HTTP 200; `/health` Backendu 2 hlási
  `provider=sqlconnect`; výsledok prihlášky 2002 zachoval skóre 100 a pôvodnú
  Azure spotrebu 651 tokenov; originál CV sa dá stiahnuť. Verejná SQL Connect
  požiadavka bez oprávnenia bola odmietnutá HTTP 403.
- **132 Python testov prešlo, 3 Firestore integračné testy boli preskočené**
  (ich emulátor nebežal). SQL Connect integrácia sa overovala proti oficiálnemu
  lokálnemu emulátoru vrátane transakčného rollbacku a odmietnutia prepisu.
- Pri tejto migrácii neboli volané Azure AI predikcie ani menený Firebase plán.
- Backend 1 stále používa lokálny SQL Server; online Azure SQL sa nasadzuje osobitne.

Backend 2 podporuje `ANALYSIS_DB_PROVIDER=sqlconnect`. Firebase SQL Connect je
relačná služba nad Cloud SQL for PostgreSQL. Firestore je samostatná NoSQL služba
a zostáva dostupný ako pôvodný zdroj migrácie a možnosť návratu.

## Rozdelenie dát

- Backend 1: používatelia, pozície, prihlášky, originály CV a poznámky v SQL Serveri
  (lokálne), resp. Azure SQL po jeho samostatnom nasadení.
- Backend 2: analýzy a história v PostgreSQL cez SQL Connect.
- Existujúca MySQL zostáva potrebná pre trvalý front úloh `analysis_jobs`.
  Tento krok front úloh nemigruje ani nemení AI model či výpočet skóre.

Schéma je v `dataconnect/schema/schema.gql`. Obsahuje tabuľky `cv_analyses`
a `analysis_runs` s cudzím kľúčom podľa `application_id`. Skóre, čas, poskytovateľ,
model a verzia výpočtu sú typované stĺpce. Úplný výsledok vrátane dôkazov je
zachovaný v JSONB snapshote. Posledný výsledok a história sa zapisujú v jednej
SQL transakcii. Mazanie odstráni históriu aj aktuálnu analýzu; front sa odstráni
najskôr, aby dokončujúci worker nemohol po vymazaní znovu zapísať výsledok.

## Prístup a konfigurácia

Použitý projekt: `smartrecruit-ai-3af8b`, región `europe-central2` (Varšava).

```dotenv
ANALYSIS_DB_PROVIDER=sqlconnect
FIREBASE_PROJECT_ID=smartrecruit-ai-3af8b
DATACONNECT_LOCATION=europe-central2
DATACONNECT_SERVICE_ID=smartrecruit-ai-3af8b-service
DATACONNECT_CONNECTOR_ID=hr-analysis
```

Privátny kľúč zostáva v `.secrets/firebase-admin.json` a nepatrí do Gitu.
Python používa Google Application Default Credentials a administrátorské REST
operácie `impersonateQuery` / `impersonateMutation`, rovnako ako Node Admin SDK.
Pri migrácii môže service account potrebovať správu SQL Connect schémy;
bežný runtime má mať iba potrebné práva na vykonanie serverových operácií.
Žiadne poverenia sa neposielajú do Reactu. Všetky nasadené operácie majú
`@auth(level: NO_ACCESS)`: priamo z prehliadača sú neprístupné. Existujúca kontrola
session, vlastníka prihlášky a HR roly zostáva v oboch backendoch.

```powershell
docker compose -f docker-compose.yml -f docker-compose.sqlconnect.yml up -d --build
```

Prípadný portový override pridajte ako ďalší `-f`. Pre lokálny server mimo
Dockeru nastavte `GOOGLE_APPLICATION_CREDENTIALS` na cestu ku kľúču.
Cloud konfigurácia nedovoľuje použiť onboarding databázu pre ostré dáta:
pri `ephemeral=true` kontrola dostupnosti a migrácia odmietnu pokračovať.
`DATA_CONNECT_EMULATOR_HOST` je povolený iba s demo projektom.

## Schéma a nasadenie

```powershell
npx -y firebase-tools@latest dataconnect:compile --project smartrecruit-ai-3af8b
npx -y firebase-tools@latest dataconnect:sql:diff --project smartrecruit-ai-3af8b
npx -y firebase-tools@latest deploy --only dataconnect --project smartrecruit-ai-3af8b
```

Pred migráciou prezrite SQL diff; pri existujúcej databáze nepoužívajte slepo
`--force`. Konfigurácia používa kompatibilné schémy a nová databáza sa pripravuje
aditívnou migráciou. Obmedzený service account nemusí mať práva čítať nastavenia
Cloud SQL alebo Service Usage cez CLI. Vtedy použite prihlásenie správcu projektu;
nepridávajte runtime účtu automaticky široké oprávnenia.

Na tomto počítači bolo potrebné oficiálnu CLI spustiť cez Node z lokálnej
inštalácie, pretože npx shim nefungoval. Schéma a konektor boli validované a
publikované cez oficiálne SQL Connect REST API. PostgreSQL migrácia obsahovala
iba päť skontrolovaných CREATE príkazov a nemenila Firebase plán.

## Presun z Firestore

Pozastavte zápisy aplikácie aj worker pred posledným prenosom. MySQL musí bežať.

```powershell
docker compose stop frontend backend-1 backend-2
docker compose -f docker-compose.yml -f docker-compose.sqlconnect.yml run --rm --no-deps backend-2 python -m app.migrate_sqlconnect
docker compose -f docker-compose.yml -f docker-compose.sqlconnect.yml run --rm --no-deps backend-2 python -m app.migrate_sqlconnect --apply
docker compose -f docker-compose.yml -f docker-compose.sqlconnect.yml up -d
```

Skript skopíruje text CV, posledný výsledok, tokenovú spotrebu a pôvod modelu aj
celú históriu. Import jednej prihlášky je atómový. Existujúci cieľ nikdy neprepíše:
opakované spustenie iba overí, že sa zhoduje celý výsledok, text aj história.
Rozdiely zastavia migráciu. História má stabilné UUID odvodené z pôvodných
Firestore ID. Import nad 10 000 historických záznamov alebo 900 kB na jednu
prihlášku sa zastaví namiesto skracovania dát. Zdrojový Firestore sa nemení.

Po prechode zostáva pôvodný Firestore ako obmedzená záložná kópia; nové analýzy
sa doň nezapisujú. Pri požiadavkách na výmaz a pri určovaní doby uchovávania treba
zahrnúť aj túto kópiu. Vymazanie zálohy nie je automatickou súčasťou migrácie.
Samotný návrat na starý Firestore po ďalších zápisoch do PostgreSQL by bol neúplný;
pred návratom treba preniesť aj nové dáta.

## Overenie bez platených AI volaní

```powershell
npx -y firebase-tools@latest emulators:start --only dataconnect --project demo-smartrecruit
```

Oficiálny emulátor používa lokálny PostgreSQL server na porte 9949 a SQL Connect
na 9399. Integračné testy vyžadujú `FIREBASE_PROJECT_ID=demo-smartrecruit` a
`DATA_CONNECT_EMULATOR_HOST`. Na Windows Docker Desktop môže kontajner dosiahnuť
emulátor cez `host.docker.internal:9399`. Testy nikdy nemažú ostré cloudové záznamy.
Testovacia konfigurácia blokuje živé Azure AI volania.

## Bezplatný režim

SQL Connect projekt bol vytvorený na Spark bez plateného plánu. Konzola uviedla
koniec trialu **31. januára 2027**. Nejde o trvalo bezplatnú SQL databázu: Spark
trial trvá 90 dní, potom je databáza bez prechodu na Blaze archivovaná a po ďalších
90 dňoch vymazaná. Trial nemá automatické zálohy; zálohovanie treba riešiť osobitne.
Migrácia nemení plán na Blaze a nezapína žiadne platby.

Zdroje: [ceny a trial](https://firebase.google.com/docs/sql-connect/pricing),
[správa databáz](https://firebase.google.com/docs/sql-connect/manage-services-and-databases),
[Admin SDK a IAM](https://firebase.google.com/docs/sql-connect/admin-sdk).
