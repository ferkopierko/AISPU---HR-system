# Azure AI pre pôvodný SmartRecruit

Implementácia nad pôvodným React/Node/Python projektom, základ `189aada`. Nový samostatný frontendový prototyp sa tu nepoužíva. Všetky zmeny sú zatiaľ lokálne.

## Čo už robí kód

1. Uchádzač sa prihlási a vytvorí jednu prihlášku na pozíciu.
2. Python si cez interné Node API overí session a vlastníctvo prihlášky. Požiadavky pozície načíta zo servera. Prehliadač nemôže poslať vlastné váhy či zmeniť hodnotenú pozíciu.
3. Skontroluje PDF/DOCX a uloží pôvodný súbor v hlavnej SQL databáze. Text, odtlačok CV a snapshot požiadaviek zaradí do MySQL radu úloh.
4. API vráti `202 Accepted`. CV sa spracuje na pozadí. Samostatný stav analýzy nemení stav prihlášky.
5. Worker podľa `AI_PROVIDER` spustí lokálne pravidlá alebo skutočné Azure Custom NER REST API. Azure dostane extrahovaný text, nie PDF/DOCX. V Azure režime sa výsledok pravidiel nepoužíva ako skrytá náhrada modelu.
6. Aplikácia zjednotí názvy zručností, zachová pasáže, offsety a istoty. Nízka istota a zachytené negácie/plány učenia sú neisté, vyžadujú overenie HR a nepridávajú body.
7. Skóre vypočíta aplikácia: súčet váh doložených požiadaviek / súčet všetkých váh × 100. Podobnosť textu je len informácia. Prax, vzdelanie, meno či iné osobné údaje skóre nemenia. Bez požiadaviek nie je skóre dostupné.
8. Výsledok so snapshotom požiadaviek, odtlačkami, poskytovateľom a verziou sa uloží ako samostatný záznam. Staré výsledky zostávajú označené pôvodným výpočtom 60/40, neprepočítavajú sa potichu.
9. Pri chybe sa zachová prihláška aj CV. Uchádzač alebo HR môže opakovať neúspešnú analýzu bez vytvorenia ďalšej prihlášky a bez nového uploadu.

Nedokončený upload sa po obnovení stránky dá doplniť k existujúcej prihláške. Duplicitné odoslanie nezaradí ďalšiu úlohu. Po uložení CV sa k tej istej prihláške nedá potichu nahrať iný súbor; opakovanie používa pôvodný text a požiadavky.

## Čo ešte potrebuješ vytvoriť v Azure

Zatiaľ nemáš službu ani model. Integrácia preto beží ako `local_rules`. Samotný API kľúč nenahrádza natrénovaný model.

1. V Azure vyber svoje predplatné a vhodnú resource group. Vytvor **Language** resource so zapnutou podporou Custom NER v podporovanom regióne. Ako prvú možnosť zvoľ **F0**, pokiaľ ho dané predplatné ponúka.
2. Pre tréning pripoj samostatný **Storage account / Blob container** podľa sprievodcu Microsoftu. Kontajner musí byť súkromný; oprávnenia nastav podľa oficiálneho postupu. Nepoužívaj používateľské CV ako tréningový dataset.
3. V Microsoft Foundry otvor Custom named entity recognition, vytvor projekt `cv-skills` s predvoleným jazykom slovenčina a zapni viacjazyčnosť pre SK/EN.
4. Priprav a skontroluj označené dokumenty. Import obsahuje jednu entitu **Skill**. Až po overení rozšír taxonómiu o ďalšie typy; vzdelanie a prax dnes ostávajú lokálne odhady.
5. Natrénuj model, skontroluj precision/recall/F1 a chyby osobitne pre slovenské a anglické dokumenty. Výsledky porovnaj s lokálnym baseline.
6. Nasaď vybraný natrénovaný model napríklad pod deployment `cv-skills-v1`. Poznač si jeho release názov a aktualizuj ho pri každom novom nasadení. Verzia uvedená v konfigurácii je deklarovaná verzia; prediction API ju nemusí nezávisle potvrdiť.
7. Endpoint a kľúč nastav iba do lokálneho `.env`, nikdy do frontendu alebo chatu. Prepni poskytovateľa a znovu vytvor iba Python kontajner.

Aktuálne limity Microsoftu uvádzajú pri F0 jednu Language službu na predplatné, hodinu tréningu mesačne a 5 000 textových záznamov predikcie mesačne. Jeden záznam neznamená automaticky celé ľubovoľne dlhé CV. Storage má vlastné účtovanie. Dostupnosť F0 a náklady si treba skontrolovať pri vytváraní; ak portál ponúkne iba platenú službu, integrácia môže zostať vypnutá. Kód nevytvára žiadne Azure resources ani nezapína platený tier.

Podklady: [limity a kvóty Custom NER](https://learn.microsoft.com/en-us/azure/ai-services/language-service/custom-named-entity-recognition/service-limits), [vytvorenie a nasadenie modelu](https://learn.microsoft.com/en-us/azure/ai-services/language-service/custom-named-entity-recognition/quickstart), [slovenčina a viacjazyčnosť](https://learn.microsoft.com/en-us/azure/ai-services/language-service/custom-named-entity-recognition/language-support).

## Tréningový štartovací balík

`sample-data/azure-ner/starter.json` obsahuje **16 krátkych syntetických dokumentov**, 12 Train a 4 Test, SK aj EN. Je to technická pomôcka na prvé zapojenie importu; nie dostatočná trénovacia množina ani dôkaz kvality modelu. Pred nasadením treba pridať dlhšie, rôzne štruktúrované a ručne skontrolované príklady. Testovacie šablóny a dokumenty musia zostať oddelené od tréningu.

Z koreňa projektu, po zostavení kontajnera:

```powershell
docker compose run --rm --no-deps -v "${PWD}/sample-data:/sample-data" backend-2 python -m app.prepare_ner --container cv-training --project cv-skills --output /sample-data/azure-ner/prepared
```

Nahraď `cv-training` skutočným názvom svojho kontajnera. Príkaz **nič nenahráva do Azure**. Vytvorí 16 `.txt` súborov a `labels.json`. Do Blob kontajnera nahraj textové dokumenty a cez import projektu použi JSON anotácie. JSON obsahuje explicitné delenie Train/Test, viacjazyčnosť a UTF-16 offsety podľa [importného formátu Microsoftu](https://learn.microsoft.com/en-us/azure/ai-services/language-service/custom-named-entity-recognition/concepts/data-formats). Pri runtime používame UnicodeCodePoint, aby dôkazy správne sedeli aj pri diakritike či emoji.

Vyhodnotenie lokálneho baseline, bez cloudového volania:

```powershell
docker compose run --rm --no-deps -v "${PWD}/sample-data:/sample-data" backend-2 python -m app.evaluate_ner --provider local_rules
```

Rovnaký príkaz s `--provider azure_custom_ner` až po aktivovaní Azure vykoná predikcie na štyroch syntetických Test dokumentoch a spotrebuje príslušnú kvótu. Reportuje exact-span precision, recall a F1 po jazykoch. Nejde o meranie správnosti HR rozhodnutia ani o kalibráciu istoty modelu. Dataset zatiaľ obsahuje iba málo príkladov.

## Aktivácia Azure

Do `.env` doplň:

```dotenv
AI_PROVIDER=azure_custom_ner
AZURE_LANGUAGE_ENDPOINT=https://tvoja-sluzba.cognitiveservices.azure.com
AZURE_LANGUAGE_KEY=<kluc-z-Azure>
AZURE_NER_PROJECT=cv-skills
AZURE_NER_DEPLOYMENT=cv-skills-v1
AZURE_NER_MODEL_VERSION=<nazov-natrenovaneho-modelu>
AZURE_NER_LANGUAGE=
AZURE_NER_SKILL_CATEGORIES=Skill
AZURE_NER_CONFIDENCE_THRESHOLD=0.75
AZURE_NER_TIMEOUT_SECONDS=90
AZURE_NER_MAX_CHARACTERS=100000
ANALYSIS_WORKER_ENABLED=true
```

Prázdny jazyk používa nastavenie viacjazyčného projektu. Confidence threshold je počiatočná hodnota, treba ju zvoliť podľa vyhodnotenia. Over tiež `INTERNAL_API_KEY`, rovnaký v oboch backendoch. Pri neúplnej Azure konfigurácii server zámerne odmietne štartovať; neprepne sa na pravidlá a netvári sa, že používa Azure.

```powershell
docker compose up -d --no-deps --build backend-2
docker compose exec backend-2 python -m app.azure_check
```

Prvý check kontroluje iba konfiguráciu. Až tento vedomý krok spotrebuje predikciu na pevnej syntetickej vete, bez CV:

```powershell
docker compose exec backend-2 python -m app.azure_check --live
```

Ak používaš lokálny portový override, zachovaj pri `compose up` rovnaké `-f docker-compose.yml -f .git/local-preview.compose.yml` ako pri ostatných službách.

## Rozhranie a bezpečnosť

- `POST /api/ml/analyze` — multipart `application_id`, `file`; vráti `202` a stav úlohy. Staré pole `requirements` sa ignoruje. Skóre už nie je v tejto odpovedi.
- `GET /api/ml/status/{id}` — `not_started`, `queued`, `processing`, `completed`, `failed`.
- `POST /api/ml/retry/{id}` — opakovanie iba neúspešnej úlohy; aktívna úloha sa nezdvojí, dokončená vracia 409.
- `GET /api/ml/results/{id}` — dokončený snapshot vrátane dôkazov a pôvodu. Bez výsledku vráti 404.
- Všetky štyri endpointy vyžadujú session a autorizáciu cez Node, vlastník alebo HR. Upload cudzieho CV sa riadi pôvodným vlastníctvom v Node.
- `GET /api/ml/capabilities` — verejná informácia o zvolenom poskytovateľovi; nikdy nevracia kľúče.

Azure kľúč ostáva v Python službe. API logovanie dokumentu je vypnuté cez `loggingOptOut`. Chybové odpovede Azure sa neukazujú používateľovi ani nezapisujú do logu. Výsledková URL sa overuje proti rovnakej Azure doméne; redirect nemôže dostať kľúč. Pri HTTP 429 sa neposiela automaticky nový platený POST.

MySQL rad používa transakčné nároky, `SKIP LOCKED` a päťminútové leases. Pri páde procesu sa rozpracovaná úloha obnoví, najviac trikrát automaticky. Ide o spracovanie **at least once**: pád po odoslaní do cloudu môže pri obnovení zopakovať cloudovú predikciu. Nie je to záruka presne jedného účtovaného volania. Nový výsledok a dokončenie úlohy sa ukladajú v jednej transakcii.

Pri ukladaní súboru a úlohy ide o dve databázy, takže pri výpadku MySQL môže CV zostať uložené bez úlohy. Opakovaný upload rovnakého súboru proces dokončí. Iný súbor sa nesmie priradiť k už zaradenej analýze. Existujúce tabuľky sa migrujú aditívne; nemaž Docker volumes.

## Overenie implementácie

Overené lokálne 27. 10. 2026: **71 Python testov, 2 Node testy, integračný test na skutočnej MySQL a zostavenie frontendu prešli**. Integračný test zachoval pôvodný záznam pri migrácii a overil súbežné nároky na jednu úlohu. Vo webovom rozhraní prešiel upload vzorového PDF cez účet `jan@test.sk`, vznik úlohy, dokončenie analýzy, načítanie po obnovení stránky a zobrazenie rovnakého výsledku v HR účte. Nemenil sa stav prijatia uchádzača. Live Azure test a vyhodnotenie Azure modelu neprebehli, pretože resource a model ešte nie sú vytvorené.

Python testy spusti z `backend-2` cez `python -m pytest -q`; potrebujú závislosti z requirements a spaCy model, nepotrebujú Azure ani databázu. Azure wire tests používajú `httpx.MockTransport` vrátane timeoutov, kvót, neúplných výsledkov, Unicode offsetov a nedôveryhodnej výsledkovej adresy. Nejde o live test nasadeného Azure modelu.

Node testy `node --test tests/analysis-context.test.js` overujú session, interný kľúč, vlastníka a HR. Nastav testovacie environment premenné podľa `.env.example`; reálna DB sa nepoužíva.

Voliteľný `python -m tests.check_mysql_queue` používa `MYSQL_ROOT_PASSWORD` a vytvorí náhodne pomenovanú dočasnú testovaciu databázu, ktorú po teste zmaže. Nepracuje s hlavnou databázou. Overuje migráciu, zachovanie starých výsledkov, súbežné claimy, retry a nulové/nedostupné skóre.

Pred ostrým nasadením zostáva: Azure resource a tréning, kalibrácia na reprezentatívnych CV, manuálne opravy a audit v HR, trvalé sessions, pravidlá uchovávania a mazania dát, prípadne OCR. Tento krok nemení existujúci výber druhej databázy na finálne rozhodnutie; provider SQL mimo Azure zostáva otvorený.
