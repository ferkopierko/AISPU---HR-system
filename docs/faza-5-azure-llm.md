# Azure LLM — spracovanie CV bez tréningu Custom NER

Tento variant používa už nasadené **gpt-4.1-mini** cez Azure Responses API. Nevyžaduje Azure Language resource, Blob dataset, Custom NER projekt ani fine-tuning. Testovacie CV stále potrebujeme na meranie kvality. Pôvodný NER adaptér zostáva voliteľný; pre túto integráciu sa používa `AI_PROVIDER=azure_llm`.

## Aktuálna konfigurácia

Endpoint dodaný používateľom:

```text
https://aispu-hr-systenm-resource.services.ai.azure.com/openai/v1/responses
```

Názov nasadenia je `gpt-4.1-mini`. Názov resource zachovávame presne vrátane `systenm`. Kľúč je iba v ignorovanom lokálnom `.env`. Nepatrí do frontendu, dokumentácie ani Git histórie.

```dotenv
AI_PROVIDER=azure_llm
AZURE_OPENAI_ENDPOINT=https://aispu-hr-systenm-resource.services.ai.azure.com/openai/v1/responses
AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
AZURE_OPENAI_API_KEY=<doplnit-iba-lokalne>
AZURE_LLM_TIMEOUT_SECONDS=60
AZURE_LLM_MAX_CHARACTERS=30000
AZURE_LLM_MAX_OUTPUT_TOKENS=3000
```

Klient akceptuje aj základ resource URL alebo `/openai/v1/`; finálnu cestu zostaví práve raz. Posiela jednu REST požiadavku s `api-key`, bez query tokenov a bez presmerovaní. Nie je potrebná nová knižnica, používa sa existujúci httpx.

## Ako sa spracuje prihláška

1. Existujúce interné API overí prihlásenie a prístup. Požiadavky pozície načíta Node backend.
2. PDF/DOCX sa uloží v hlavnej databáze, text a snapshot požiadaviek do trvalého radu MySQL.
3. Worker pošle text CV na nakonfigurovaný Azure endpoint. Model dostane pevnú inštrukciu extrahovať zručnosti a vrátiť JSON podľa schémy.
4. Každý nález obsahuje presný názov uvedený v texte, doslovnú citáciu a klasifikáciu `supported`, `learning`, `negated` alebo `uncertain`.
5. Python skontroluje formát aj existenciu citácie a zručnosti v nej. Rozdiel v zalomení riadkov alebo bielych znakoch môže spárovať s pôvodným textom PDF; uloží a zobrazí vždy originálny úsek. Slová, veľkosť písmen ani obsah sa pri tejto kontrole nemenia. Offsety vypočíta sám; neverí vygenerovaným offsetom ani vymysleným aliasom. Vymyslená citácia, odmietnutie alebo nedokončený výstup znamenajú chybu celej analýzy, nie nulu.
6. Zmienky o učení, negácie a nejasné výsledky sa zobrazia ako neisté a nezapočítajú sa do pokrytia. LLM nedostáva priestor vygenerovať skóre ani rozhodnutie o prijatí.
7. Výsledné skóre počíta existujúci Python kód podľa váh. Zachová sa model oznámený API, názov nasadenia, verzia promptu, tokenová spotreba, snapshot požiadaviek a odtlačok CV.

Prax a vzdelanie zatiaľ zostávajú pôvodnými lokálnymi odhadmi; tento adaptér ich nevyhodnocuje pomocou LLM. Nevytvárame číselnú „istotu LLM“ — vlastné percento vypísané modelom by nebolo kalibrovanou pravdepodobnosťou.

## Prevádzka a obmedzenia

- Cloudové spracovanie je uvedené uchádzačovi pred odoslaním CV. Staršie lokálne výsledky ostávajú lokálnymi výsledkami; zapnutie Azure ich automaticky neodošle do cloudu.
- Text CV je nedôveryhodný vstup. Inštrukcie sú oddelené od dokumentu. Model nemá nástroje, web, súborový systém ani prístup k databáze či kľúču. To znižuje riziko prompt injection, ale nezaručuje správny význam každej extrakcie.
- Doslovná citácia potvrdzuje existenciu textu, nie pravdivosť skúsenosti alebo úplné porozumenie kontextu. Výsledky vyžadujú kontrolu HR. Reprezentatívne testovanie SK/EN je stále potrebné.
- `store=false` vypína ukladanie Responses objektu pre následné získanie cez API; samo osebe to nie je záruka nulovej retencie vo všetkých službách Azure. Prevádzkové podmienky resource treba posúdiť pred používaním reálnych CV.
- Limit textu a výstupných tokenov chráni spotrebu. Príliš dlhý dokument sa potichu neskráti. Neúplný JSON sa nepoužije na čiastočné skórovanie.
- Pri timeoutoch, 429 alebo inom zlyhaní sa neposiela automaticky ďalší platený POST a nepoužije sa skryto lokálny výsledok. Používateľ môže existujúcu neúspešnú úlohu zopakovať. Pri páde worker procesu platí existujúca politika obnovy radu „at least once“.
- Testovacie účty, API a databázy zostávajú rovnaké. Aktualizujú sa iba Backend 2 a frontend; hlavné databázy ani volumes sa nemažú.

## Overenie a aktivácia

Prvé živé volanie 27. 10. 2026 úspešne použilo endpoint a nasadenie dodané používateľom. Poslaná bola iba pevná syntetická veta so zručnosťami Python, SQL a Docker. API vrátilo všetky tri a spotrebu **358 vstupných + 60 výstupných = 418 tokenov**. Kľúč sa nevypisoval. Tento smoke test potvrdzuje pripojenie, nie kvalitu analýzy reálnych CV.

Následne prešiel celý webový tok na syntetickom `CV-Martin-Kovac-backend.pdf`: prihláška 1003, uloženie dokumentu, MySQL rad, Azure LLM a uložený výsledok. Úspešné spracovanie s promptom `cv-skills-llm-v2` použilo **673 vstupných + 549 výstupných = 1222 tokenov**. Vrátené pokrytie je **83,33 % (5 zo 6 rovnako vážených požiadaviek)**. Model v tomto príklade vynechal jazyk English, hoci sa v CV nachádza — konkrétny dôvod na dopracovanie pokrytia jazykových zručností a testovacej množiny. Nemožno to považovať za overenú kvalitu pre reálne CV. Predchádzajúci pokus správne skončil chybou pri neoverenej citácii; po doplnení kontroly zalomenia riadkov sa zopakovala tá istá prihláška, nevznikla ďalšia. Neúspešné cloudové volania môžu tiež spotrebovať tokeny; ich spotrebu treba sledovať v Azure.

Offline suite: **94 Python testov prešlo bez siete**. Testovacia konfigurácia núti lokálny režim aj vtedy, keď vývojársky `.env` zapína Azure; Azure testy používajú falošné transporty a kľúče. Frontend úspešne zostavený. Lokálny web teraz hlási `provider=azure_llm` a `cloud_processing=true`.

Offline testy používajú `httpx.MockTransport` a overujú aj Unicode, presné citácie, klasifikáciu učenia/negácie, odmietnutie modelu, skrátené výstupy, zlý JSON, kvóty, presmerovania a nezávislý výpočet skóre.

```powershell
docker compose -f docker-compose.yml -f .git/local-preview.compose.yml up -d --build --no-deps backend-2 frontend
docker compose exec backend-2 python -m app.azure_check
```

Kontrola bez `--live` nevykoná cloudové volanie. Voliteľné `--live` spotrebuje tokeny na syntetickej vete. Skutočné API kľúče nikdy nezadávaj priamo do príkazu.

Podklady: [Azure Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses), [OpenAI Docs — structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
