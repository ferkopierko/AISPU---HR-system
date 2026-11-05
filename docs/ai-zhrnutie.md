# Stručné zhrnutie CV voči pozícii

Pri nových analýzach s `AI_PROVIDER=azure_llm` dostane model celé extrahované CV
a názov, opis, náplň práce aj požiadavky pozície. V **jednom volaní Azure Responses
API** vráti zručnosti s citáciami a štyri krátke slovenské vety pre HR:
doloženú súvislosť skúseností s prácou, relevantné zručnosti, nejasné podklady
a tému na overenie pri pohovore. Vysvetlenie môže pracovať s kontextom a parafrázami.
Samotný názov predchádzajúcej práce nedokazuje konkrétnu technológiu ani odbornosť.

CV aj pozícia sa považujú za nedôveryhodné dáta, nie pokyny pre model.
Zručnosti a citácie sa prijímajú iba z CV a citácie sa overujú proti originálnemu textu.
Skóre naďalej počíta aplikácia ako vážené pokrytie explicitných požiadaviek;
textové zhrnutie skóre ani stav prihlášky nemení. Model nemá odporúčať prijatie
alebo zamietnutie. HR má jeho závery overiť podľa podkladov.

Spoločný vstup má limit `AZURE_LLM_MAX_CHARACTERS` a výstup
`AZURE_LLM_MAX_OUTPUT_TOKENS`. Príliš dlhý vstup sa odmietne pred volaním,
neskracuje sa potichu. Nevykonávajú sa skryté POST retry.

Zhrnutie je uložené spolu s analýzou v `analysis_metadata.review_summary`, opis
pozície v `position_snapshot`. Celková spotreba je v `analysis_metadata.usage`.
Zhrnutie má `usage_scope=shared_analysis`, prázdne vlastné `usage` a kópiu
spoločnej spotreby v `shared_usage`; tokeny sa nesmú sčítať dvakrát.
HR a správca ho pri otvorení analýzy dostanú bez ďalšieho AI volania.
Uchádzač ho nedostane ani cez endpoint výsledku analýzy.

Staršie analýzy sa automaticky neprepočítavajú. Ak zhrnutie nemajú, HR môže použiť
**Vytvoriť AI zhrnutie**: jedno samostatné volanie s limitom 650 výstupných tokenov
dostane názov pozície a už vyhodnotené zhodné, chýbajúce a neisté zručnosti.
Taký výsledok sa ukladá v hlavnej SQL databáze v `application_review_summaries`.
Pri inom poskytovateľovi vznikne označený pravidlový prehľad bez LLM volania.

Opakovaný GET alebo POST používa uložený výsledok. Zmenené požiadavky alebo
zmenený uložený opis pozície vyžadujú novú analýzu. Pri staršom samostatnom
generovaní sa súbežné požiadavky koordinujú krátkou SQL transakciou a päťminútovým
lease; počas AI volania sa SQL zámky nedržia. Prerušené volanie už mohlo tokeny
spotrebovať. Endpointy sú chránené rolou a interným API kľúčom.

Pri stiahnutí alebo retenčnom vymazaní prihlášky sa odstránia aj analýza a zhrnutie.
Nasadenie vyžaduje aktuálnu SQL schému a oba backendy; lokálne
`docker compose up -d --build`. Azure nasadenie potrebuje rovnakú migráciu.

Overenie 4. 11. 2026 na syntetickej prihláške Martina Kováča (3002): spoločná
analýza a štyri vety stáli 1591 tokenov (1110 vstup, 481 výstup). Zachytila aj
angličtinu B2, ktorú predchádzajúca analýza vynechala. Opakované načítanie
a POST použili totožný výsledok; kandidát zhrnutie nedostal.
