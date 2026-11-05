# Používateľské roly

| Hodnota | Rola | Prístup |
|---|---|---|
| `user` | Uchádzač | Vlastný profil a prihlášky |
| `admin` | HR manažér | Nábor, pozície a všetky prihlášky |
| `sysadmin` | Správca systému | HR funkcie, zoznam účtov, zmena rolí a história oprávnení |

Verejná registrácia vždy vytvorí uchádzača. Kolega sa najprv zaregistruje,
potom mu správca na `/admin/users` pridelí rolu HR manažéra alebo správcu.
Zmena vyžaduje samostatné potvrdenie a nemení heslo účtu.
Pozvánky e-mailom zatiaľ nie sú implementované.

## Prvý správca

Najprv aplikujte aktuálnu `database/azure-sql/schema.sql` (lokálne ju vykoná
služba `mssql-init`). Existujúce HR účty sa automaticky nepovyšujú.
Pre dôveryhodný už existujúci účet použite:

```powershell
docker compose exec backend-1 npm run create-system-admin -- vas-email@example.com
```

Príkaz nemení heslo a zaznamená povýšenie do histórie ako vykonané cez príkazový
riadok. Na tomto lokálnom prostredí bol takto nastavený `hr@firma.sk`.
Na Azure treba schému a bootstrap vykonať v príslušnom nasadení samostatne.

Backend číta aktuálnu rolu z databázy pri každom API volaní. Odobratie práv
platí aj pre už prihlásené relácie. Rozhranie sa aktualizuje po obnovení stránky.
Správca nemôže meniť vlastnú rolu; posledný správca musí zostať zachovaný.
Zmeny a audit sa ukladajú v jednej transakcii. Zmeny rolí sa serializujú a server
opätovne overí oprávnenie správcu aj vo vnútri transakcie.

## Lokálne integračné overenie

Test potrebuje lokálny testovací účet `hr@firma.sk` ako správcu systému.
Vytvorí vlastný dočasný účet a po teste ho spolu s jeho testovacou históriou odstráni.
Nikdy ho nespúšťajte na produkcii; test odmietne iný SQL host než `mssql`.

```powershell
docker compose exec -e ROLE_INTEGRATION=1 backend-1 node --test tests/system-roles.test.js
```
