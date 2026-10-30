# Firebase namiesto MySQL pre analýzy CV

## Overené lokálne nasadenie – 30. 10. 2026

- Online projekt: `smartrecruit-ai-3af8b`, databáza `(default)`, Standard / Native,
  región `europe-central2` (Varšava).
- Štyri analýzy aj všetky štyri historické skóre boli prenesené z MySQL.
  Výsledky, UTC časy, text CV a počty histórie boli porovnané so zdrojom.
- Backend 2 používa online Firestore; MySQL a testovací emulátor sú zastavené.
  Pôvodný MySQL volume zostal zachovaný.
- Backend 1 na tomto počítači stále používa lokálny SQL Server, nie online Azure SQL.
- V súkromnom `.env` je `COMPOSE_FILE` nastavený na základný Compose, Firestore
  override a lokálny portový override. Preto na tomto počítači stačí
  `docker compose up -d` a použije sa Firestore.
- Kľúč je v ignorovanom `.secrets/firebase-admin.json` a v kontajneri je pripojený
  iba na čítanie. Žiadne prihlasovacie údaje nie sú v zdrojových súboroch.
- Prešlo 81 testov vrátane integračných testov s oficiálnym lokálnym emulátorom.
  Online `/health` hlási `provider=firestore`; neprihlásený REST prístup do databázy
  vracia HTTP 403.
- Indexové výnimky uvedené nižšie sú pripravené v repozitári, ale v online projekte
  zatiaľ nie sú nasadené: service account nemá právo spravovať indexy (HTTP 403).
  Databáza používa predvolené indexy; čítanie podľa ID a aplikácia fungujú aj tak.
  Výnimky možno neskôr nasadiť cez CLI prihlásené účtom správcu projektu.

Backend 1 ďalej používa Azure SQL (pri lokálnom Docker spustení SQL Server).
Backend 2 vie namiesto MySQL ukladať výsledky do **Cloud Firestore Standard / Native mode**.
Frontend aj HTTP API zostávajú rovnaké. Firebase Authentication sa nepoužíva;
prihlasovanie a účty ďalej spravuje Backend 1.

## Online databáza

1. V [Firebase Console](https://console.firebase.google.com/) vytvorte alebo vyberte projekt.
2. Vytvorte Cloud Firestore Standard databázu `(default)` v európskom regióne
   (napríklad `europe-west3`). Vyberte **Production mode**.
3. Pre Backend 2 použite samostatný service account s rolou `roles/datastore.user`.
   Pri lokálnom Docker spustení uložte jeho JSON kľúč do `.secrets/firebase-admin.json`.
   Súbor sa necommituje ani nekopíruje do image; Docker ho pripojí iba na čítanie.
   Pri nasadení na Google Cloud použite pripojenú identitu a Application Default Credentials.
4. Do `.env` doplňte `FIREBASE_PROJECT_ID=<skutocne-project-id>`.
5. Nasaďte pravidlá a indexové výnimky z tohto repozitára:

   ```powershell
   npx firebase-tools deploy --only firestore --project <skutocne-project-id>
   ```

   `firebase.json` odkazuje na `database/firestore/firestore.rules` a
   `firestore.indexes.json`. Klientske čítanie aj zápis sú zakázané. Serverový SDK
   používa IAM; pravidlá nenahrádzajú obmedzenie práv service accountu.
6. Zostavte backend a spustite cieľovú konfiguráciu po prípadnej migrácii:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.firestore.yml up -d --build
   ```

Tento override odstráni závislosť Backendu 2 od MySQL. Existujúce MySQL dáta ani
volume nezmaže. Ak MySQL kontajner už beží, po overení migrácie ho možno zastaviť:

```powershell
docker compose stop mysql
```

**Azure pripojenie je samostatné:** základný `docker-compose.yml` stále smeruje
Backend 1 na lokálny `mssql/hr_main`. Použitie Firestore automaticky neprepája
Backend 1 do online Azure SQL.

## Dáta a súkromie

- `cv_analyses/{application_id}`: posledný kompletný výsledok, zručnosti,
  vzdelanie, prax, skóre, UTC čas a text CV komprimovaný gzip do poľa `raw_text_gzip`.
- `cv_analyses/{application_id}/history/{id}`: história skóre a štruktúrovaných
  výsledkov. Nové skóre a posledný výsledok sa zapisujú v jednom atómovom batchi.
- ID prihlášky zostáva ID zo SQL databázy. Vo Firestore je ID dokumentu reťazec.
- Binárny originál CV zostáva v SQL databáze; frontend nemá Firebase prihlasovacie údaje.
- Mazanie cez existujúce interné API odstráni aj celú históriu, postupne v batchoch
  po 400 záznamoch. Pri chybe zápisu/mazania sa chyba prenesie volajúcemu.
- Veľkosť výsledku sa kontroluje pred zápisom; príliš rozsiahle CV vráti HTTP 413.
- Databázové chyby nikdy nespôsobia tichý návrat na MySQL.
- Indexovanie analytických polí je vypnuté: výsledok sa číta priamo podľa ID,
  čo nepotrebuje vyhľadávanie ani zložené indexy.

## Migrácia existujúcich analýz

Počas migrácie pozastavte nahrávanie CV, zmeny stavov a mazanie prihlášok.
Zdrojová MySQL musí zostať spustená a dostupná na `MYSQL_HOST=mysql`.
Skript je aditívny: nič nemení v MySQL a neprepisuje existujúce cieľové prihlášky.
Skopíruje poslednú analýzu, text aj všetky skóre; existujúca MySQL uchovávala iba
poslednú verziu zručností/vzdelania, preto sa tieto údaje pri starších skóre nedajú rekonštruovať.

```powershell
docker compose stop frontend backend-1 backend-2
docker compose -f docker-compose.yml -f docker-compose.firestore.yml build backend-2
docker compose -f docker-compose.yml -f docker-compose.firestore.yml run --rm --no-deps backend-2 python -m app.migrate_firestore
docker compose -f docker-compose.yml -f docker-compose.firestore.yml run --rm --no-deps backend-2 python -m app.migrate_firestore --apply
docker compose -f docker-compose.yml -f docker-compose.firestore.yml up -d
```

Prvý príkaz skriptu iba spočíta záznamy a overí pripojenia. `--apply` zapisuje.
Opakovanie preskočí dokončené prihlášky; deterministické ID histórie umožňujú
dokončiť prerušený prenos. Migráciu spúšťajte jedným procesom, bez súbežných zápisov.
Skript nepresúva používateľov, pozície, prihlášky ani originály CV zo SQL databázy.
Pôvodný režim obnovíte explicitným spustením `docker compose -f docker-compose.yml up -d`
(prípadný lokálny portový override doplňte ako ďalší `-f`). Explicitné `-f` má
prednosť pred `COMPOSE_FILE` v súkromnom `.env`.

## Lokálne overenie bez účtu

Oficiálny Firestore emulátor je samostatná služba s demo projektom:

```powershell
docker compose -f docker-compose.yml -f docker-compose.firestore-emulator.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.firestore-emulator.yml exec backend-2 python -m pytest -q
```

Emulátor je dostupný iba na `127.0.0.1:8085`. Nepoužíva cloudové prihlasovacie
údaje. Jeho dáta sú dočasné a nie sú produkčnou databázou ani zálohou.
Integračné testy vyžadujú `FIRESTORE_EMULATOR_HOST` a projekt s prefixom `demo-`;
proti online projektu sa nespustia. V online konfigurácii je emulator host prázdny.

Pri spustení Python servera mimo Dockeru nainštalujte oba zoznamy závislostí:

```powershell
pip install -r requirements.txt -r requirements-firestore.txt
```

Nastavte `ANALYSIS_DB_PROVIDER=firestore`, `FIREBASE_PROJECT_ID` a pre online
databázu `GOOGLE_APPLICATION_CREDENTIALS` (alebo dostupné ADC). MySQL premenné
sa v režime Firestore nevyžadujú, okrem jednorazového migračného skriptu.

Referencie: [serverový SDK](https://firebase.google.com/docs/firestore/quickstart-server),
[limity](https://firebase.google.com/docs/firestore/quotas),
[emulátor](https://firebase.google.com/docs/emulator-suite/connect_firestore).
