# SmartRecruit AI

HR systém na správu pracovných pozícií, prihlášok a analýzu životopisov.
Školský projekt na predmet *Architektúra informačných systémov a prediktívna údržba*.

## Funkcie

- **Uchádzač:** prezeranie ponúk, odoslanie CV (PDF/DOCX), vlastné prihlášky a história stavov.
- **HR manažér:** správa pozícií, hodnotenie prihlášok, originály CV, poznámky a zmeny stavov.
- **Správca systému:** HR funkcie a prideľovanie používateľských rolí.
- Svetlý a tmavý režim; SK/EN na prihlásení a registrácii.

## AI analýza

Azure LLM porovnáva text CV s opisom pozície, extrahuje zručnosti s citáciami
a vytvára stručné zhrnutie pre HR. Analýza prebieha na pozadí a výsledok sa ukladá.
Skóre zhody počíta aplikácia podľa váženého pokrytia požadovaných zručností.
Používa sa predtrénovaný model cez API, vlastný tréning nie je súčasťou tohto režimu.

Bez Azure konfigurácie je dostupný lokálny režim `AI_PROVIDER=local_rules`.
Podrobnosti: [Azure LLM](docs/faza-5-azure-llm.md), [AI zhrnutia](docs/ai-zhrnutie.md).

## Technológie a databázy

| Časť | Technológia |
|---|---|
| Frontend | React + Vite |
| Backend 1 | Node.js / Express – účty, pozície a prihlášky |
| Backend 2 | Python / FastAPI – spracovanie CV a analýzy |
| Hlavná databáza | SQL Server lokálne alebo Azure SQL podľa nasadenia |
| Analýzy | MySQL, Firebase SQL Connect (PostgreSQL) alebo Firestore podľa konfigurácie |

Základný Docker používa lokálny SQL Server a MySQL. Variant SQL Connect ukladá
analýzy do vzdialeného PostgreSQL; MySQL zostáva pre rad úloh.

## Lokálne spustenie

Vyžaduje Docker s Docker Compose.

1. Vytvor `.env` zo vzoru:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Nastav vlastné `SESSION_SECRET`, `INTERNAL_API_KEY` a heslá databáz.
   Pre spustenie bez cloudového AI nechaj `AI_PROVIDER=local_rules`.
3. Spusti aplikáciu:

   ```powershell
   docker compose -f docker-compose.yml up -d --build
   ```

4. Otvor portál, ktorý potrebuješ:

   | Portál | Adresa |
   |---|---|
   | Portál uchádzača | [localhost:5173](http://localhost:5173) |
   | HR portál | [localhost:5174](http://localhost:5174) |

### Dva frontendy a sessions

Uchádzači a HR pracujú v dvoch samostatných aplikáciách v kontajneroch `frontend` a
`frontend-hr`. Sú zostavené z toho istého kódu (`frontend/`, `VITE_APP=candidate|hr`)
a volajú tie isté backendy. Každý portál posiela hlavičku `X-Client-App`, podľa ktorej
Backend 1 používa vlastnú cookie (`sr.candidate.sid`, `sr.hr.sid`). V jednom prehliadači
tak môže byť prihlásený uchádzač aj HR naraz. Do HR portálu sa prihlási iba HR účet.
Sessions sú uložené v SQL Serveri (`dbo.sessions`), takže prežijú reštart Backendu 1.
Podrobnosti: [docs/frontendy-a-sessions.md](docs/frontendy-a-sessions.md).

### Testovacie účty

Účty vytvárané pri inicializácii novej lokálnej databázy:

| Rola | E-mail | Heslo |
|---|---|---|
| HR manažér (HR portál :5174) | `hr@firma.sk` | `Admin1234` |
| Uchádzač (portál :5173) | `jan@test.sk` | `Heslo1234` |

Existujúci účet možno povýšiť na správcu systému:

```powershell
docker compose exec backend-1 npm run create-system-admin -- hr@firma.sk
```

Vzorové životopisy sú v [sample-data/cv](sample-data/cv/).
`.env` a súkromné kľúče nepatria do Gitu. Push kódu neprenáša databázové dáta.

## Dokumentácia

- [Používateľské roly](docs/pouzivatelske-roly.md)
- [Dva frontendy a sessions](docs/frontendy-a-sessions.md)
- [Firebase SQL Connect / PostgreSQL](docs/sqlconnect.md)
- [Cloud Firestore](docs/firebase.md)
- [Nasadenie na Azure](docs/azure-nasadenie.md)
- [Technický základ](docs/TECHNICKY_ZAKLAD.md)
- [BPMN diagram](docs/smartrecruit-proces.bpmn) · [náhľad](docs/diagram.svg)
