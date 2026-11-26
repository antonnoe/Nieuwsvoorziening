# Drempelanalyse (24 november 2026, herzien in herstelronde 1)

## Uitkomst

**`data/config.json` is niet gewijzigd.** De metingen (hieronder) wijzen niet naar de drempels als hoofdknelpunt: 0 berichten geblokkeerd door de poort, 0 mislukte syntheses, en van de 44 concepten haalden er slechts 8 een score van 55 of hoger zonder poortreden (alleen die 8 zou `minRelevantie` kunnen schelen, en de relevantie zelf is niet bewaard, dus niet te zeggen hoeveel er tussen 55 en 59 zaten). Het knelpunt zit eerder: te weinig clusters met genoeg bronnen, een plafond van 6 per run dat de meest-bronnen-clusters (vooral landelijke politiek) voorrang geeft, en een modeloordeel dat die clusters laag op relevantie zet. Doel is 10 tot 20 berichten per dag; gemeten is circa 1 tot 4 per dag.

## Meting (24 november 2026 ca. 20:20 UTC)

Bronnen: openbare API `https://nieuws.infofrankrijk.com/api/status`, `/api/tellingen?uren=24`, `/api/tellingen?uren=168`, `/api/nieuws?limiet=100`, plus een alleen-lezen SELECT op `nv_oogst_runs` en `nv_berichten` in Supabase (project communities-tools). Er is niets geschreven.

### /api/status (ruw, kerncijfers)

- Bronnen: 20 actief, 15 concept. Opslag: aan. Synthesemodel claude-sonnet-5-5, goedkoop claude-haiku-4-5. Unsplash werkt (49 aanvragen per uur over).
- `berichtenTotaal` **49** (alles, ook concept en geblokkeerd), `gepubliceerdTotaal` **5**, `gepubliceerdVandaag` 2, `openItems` 831, `signalenGesignaleerd` 1.
- `laatsteOogst` (start 19:00 UTC, klaar na 2 minuten): bronnen 20 en bronnenOk 20 (bronnenMislukt 0), itemsGelezen 311, itemsNieuw 137, itemsNaZeef 224, poolOpen 816, **clusters 127, clustersGenoegBronnen 11, kandidaten 6, concept 3, geblokkeerd 0, gepubliceerd 1, syntheseMislukt 0**, herschreven 0, artikelenGelezen 15, peilSignalen 1, fouten leeg.
- De status bevat geen reden-verdeling; die staat wel in de database (zie hieronder).

### /api/tellingen en /api/nieuws

- `?uren=24`: totaal **2** (politiek 1, economie en ondernemen 1). `?uren=168`: totaal **5** (politiek 1, economie en ondernemen 3, natuur en rampen 1), gelijk aan alle berichten sinds de start.
- `/api/nieuws?limiet=100`: 5 berichten; per UTC-dag **23 november 3, 24 november 2**. Categorieen: economie en ondernemen 3, politiek 1, natuur en rampen 1 (de overige vier categorieen hebben nul). Portemonnee: 4 van de 5. Bronnen per bericht: 2, 6, 2, 2, 2.
- Het doel (10 tot 20 per dag) staat tegenover circa 1 tot 4 per dag: de feitelijke stand is minstens een factor 3 tot 10 onder het doel.

### Trechter per run (`nv_oogst_runs`, alle 15 runs sinds de start op 23-11 14:01 UTC)

Vijf van die runs waren handmatig, tussen 16:28 en 17:46 UTC op 23-11. De zes geplande runs van 24-11 zijn:

| Run (UTC) | clusters | genoeg bronnen | kandidaten | concept | gepubliceerd |
|---|---|---|---|---|---|
| 24-11 03:00 | 128 | 4 | 4 | 3 | 0 |
| 24-11 07:00 | 130 | 7 | 6 | 4 | 0 |
| 24-11 11:00 | 108 | 19 | 6 | 3 | 1 |
| 24-11 15:00 | 129 | 9 | 6 | 4 | 0 |
| 24-11 19:00 | 127 | 11 | 6 | 3 | 1 |

(Ook 23-11 23:00: 134 clusters, 8 genoeg, 6 kandidaten, 5 concept, 0 gepubliceerd.) Over alle 15 runs: geblokkeerd **0** en syntheseMislukt **0** in elke run; kandidaten stond in 9 van 15 runs op het plafond van 6 en in al die 9 lagen er meer clusters met genoeg bronnen (7 tot 19) dan er syntheses mochten. Per geplande dag ligt het aantal gepubliceerde berichten tussen 0 en 3.

### Verdeling in de database (`nv_berichten`, 49 rijen)

| Status | n | score >= 55 | score 50 tot 54 | score < 50 | met poortreden of herschrijf-reden |
|---|---|---|---|---|---|
| gepubliceerd | 5 | 5 | 0 | 0 | 0 |
| concept | 44 | 12 | 15 | 17 | 4 |
| geblokkeerd | 0 | | | | |

- De 4 concepten met reden zijn herschrijf-gevallen uit stap 6a ("model gaf geen bericht (publiceren=false)" 3 keer, "relevantie 22 onder 60" 1 keer), geen poortblokkades.
- Van de 12 concepten met score >= 55 hebben er 8 geen reden. Omdat de poort slaagde en de score hoog genoeg was, is bij die 8 de relevantie onder 60 de enige verklaring. Dat is 18% van de concepten (8 van 44); de overige 32 concepten halen de score van 55 niet (score onder 55: 32, waarvan 17 onder 50).
- Berichten met 4 of meer bronnen: 12 concept (politiek 7, algemeen 2, economie 2, natuur 1) en 1 gepubliceerd (economie). Dit zijn de clusters die de volgorde (meeste bronnen eerst) bovenaan zet; ze worden bijna allemaal concept.
- De relevantie zelf wordt niet bewaard, dus de verdeling 55 tot 59 is niet meetbaar. Dat blijft het voorstel voor een migratie (kolom `relevantie` op `nv_berichten`).

## Wat de code zegt over de knelpunten

Uit `lib/motor/motor.ts` (regels 165 en 166, 213) en `lib/motor/score.ts`:

1. De kandidaten worden gesorteerd op aantal bronnen (meeste eerst), dan op nieuwste, en afgekapt op `maxSynthesesPerRun` (6). Clusters met veel bronnen zijn vaak landelijke politiek, die het model bewust laag op relevantie zet (herstelronde 1). Zo gaan zes plaatsen per run naar clusters die toch concept worden, terwijl een cluster met twee bronnen over een prijs of regel voor Nederlanders in Frankrijk kan blijven liggen. Dit is een **hypothese** die de meting ondersteunt maar niet bewijst: de relevantie per cluster is niet bewaard.
2. Status wordt `gepubliceerd` alleen bij score >= 55 EN relevantie >= 60 EN poort ok. Score = 0,5 x relevantie + 0,3 x bronscore + 0,2 x versheid (pers: 35 bij 1 bron, 65 bij 2, 90 bij 3 of meer). Met 2 bronnen halen verse berichten 55 bij relevantie rond 31 tot 44, dus `minRelevantie` 60 beperkt, niet `publiceerDrempel`; de meting bevestigt dat: 8 concepten staan boven 55 maar onder relevantie 60.
3. Een cluster dat concept of geblokkeerd wordt, geldt als verwerkt en komt niet terug.
4. Het aantal clusters met genoeg bronnen is klein (4 tot 19 per run, ongeveer 3 tot 15% van 108 tot 134 clusters). Een groot deel van het aanbod valt dus al vóór de synthese af: de zeef en de eis van twee onafhankelijke bronnen (heuristiek clustert alleen binnen een taal).
5. `maxBerichtenPerDag` (20) is bij 1 tot 4 per dag nooit de beperking.

## Aanbeveling (onderbouwd)

1. **Geen wijziging in `data/config.json`.** De beslisregels uit de eerste versie zeggen: `minRelevantie` omlaag (60 naar 55, nooit onder 50) als de meeste concepten op relevantie onder 60 met score >= 55 blijven hangen. Hier is dat 8 van 44; de meeste concepten (32) hebben een te lage score. De regel `maxSynthesesPerRun` van 6 naar 8 vraagt dat vrijwel alle pogingen slagen; hier slaagt 5 van 49 (10%). Beide voorwaarden zijn niet gehaald, dus ook geen bescheiden stap. Verlagen zou bovendien de kwaliteit raken die herstelronde 1 bewust heeft aangescherpt.
2. **Eerst meten wat er in het cijfer 55 tot 59 zit.** Bewaar `relevantie` per bericht (migratie, door de regisseur toe te passen). Pas daarna eventueel `minRelevantie` 60 naar 55 (één stap), 3 dagen meten.
3. **Knelpunt 1 (volgorde)**: onderzoek of de volgorde van kandidaten (nu meeste bronnen eerst) beter op een relevantie-voorspeller kan, of dat ruimte per run gereserveerd wordt voor clusters met twee bronnen en `portemonnee`-kans. Dat is een codewijziging in `motor.ts`, buiten deze opdracht.
4. **Knelpunt 2 (aanbod)**: onderzoek de 15 bronnen met status CONCEPT (nu 20 actief) en de Frans-Nederlandse clustering; alleen met 3 tot 5 dagen extra `/beheer`-data is te zeggen of meer ACTIVE-bronnen helpen.
5. Het poortcijfer in het stroomvoorstel (>= 10 per dag gedurende 14 dagen) blijft de doelstelling; de feitelijke stand (circa 1 tot 4 per dag) staat erbij, en vóór dat doel gehaald is, gaat er geen stroom uit.

## Beslisregels voor na 3 tot 5 dagen `/beheer` (ongewijzigd, nu met de huidige meting ernaast)

- Zijn de meeste concepten tussen score 45 en 54 met relevantie >= 60: `publiceerDrempel` van 55 naar 50 (stap van 5), 3 dagen meten. Nu: 15 concepten tussen 50 en 54, relevantie onbekend.
- Zijn de meeste concepten onder relevantie 60 met score >= 55: `minRelevantie` van 60 naar 55, niet verder dan 50. Nu: 8 van 44, dus niet de meerderheid.
- Weinig concepten en weinig kandidaten: bronnen en clustering, niet drempels. Nu: kandidaten staan in 9 van 15 runs op het plafond, het aanbod aan clusters met genoeg bronnen is wisselend (4 tot 19).
- Pogingen steeds 6 per run en bijna alle slagen: `maxSynthesesPerRun` van 6 naar 8. Nu: 10% slaagt.
- Houd `/beheer` open op geblokkeerd: stijgt het aandeel poortblokkades (nu 0), dan terug.
- `REGELVERSIE` blijft 2; de poort blijft ongemoeid.


## Wijziging 26 november 2026 (keuze A): kandidaatkeuze en plafond per run

Besluit opdrachtgever: Nieuwsvoorziening wordt de enige nieuwsmotor en moet daarom meer leveren dan de 1 tot 4 berichten per dag van nu (doel 10 tot 20). De drempels en de poort zijn bewust niet verlaagd; de analyse hierboven wees het aanbod en de kandidaatvolgorde aan als knelpunt.

Wat is gewijzigd:

1. **Plafond per run van 6 naar 10** (`maxSynthesesPerRun` in `data/config.json` en `lib/motor/config.ts`). Reden: in 9 van 15 runs stond `kandidaten` op het plafond terwijl er 7 tot 19 clusters met genoeg bronnen waren. `maxBerichtenPerDag` (20) blijft de harde bovengrens per dag; `publiceerDrempel` (55), `minRelevantie` (60) en de kwaliteitspoort zijn ongewijzigd.
2. **Volgorde op verwachte relevantie** (`lib/motor/kandidaten.ts`, `kiesKandidaten`). Voorheen: meeste bronnen eerst, dan nieuwste. Nu: eerst een eenvoudige verwachting (0 tot 100) uit titel en omschrijving zonder modelaanroep: een concreet gevolg voor de lezer (prijs, belasting, pensioen, verkeer, weer, enzovoort) telt mee, landelijke politiek en lokale affaires tellen af, overheidsbronnen krijgen een kleine bonus, twee of drie bronnen een kleine plus; veel bronnen geven geen voorrang meer. Bij gelijke verwachting eerst meer bronnen, dan nieuwste. De verwachting bepaalt alleen de volgorde; het model en de drempels beslissen nog steeds over publicatie. De heuristiek is een hypothese (de relevantie per cluster is niet bewaard): meet na een week in `/beheer` of het aantal gepubliceerde berichten per dag stijgt en of het aandeel concepten daalt.
3. **Tijdbudget voor de kandidatenlus** (`KANDIDAAT_BUDGET_MS`, 330 s, in `lib/motor/motor.ts`). De functie mag 800 s duren (`maxDuration`); de bestaande optionele stappen (herschrijven, beeld aanvullen, PEIL-zinnen) stoppen bij 480 s. Meting: de run van 24-11 19:00 UTC met 6 kandidaten was na ongeveer 2 minuten klaar, dus circa 15 tot 20 s per kandidaat inclusief de rest van de run. Tien kandidaten kosten dan zo'n 3 tot 4 minuten, ruim onder het budget. Is een dag trager (herkansing, artikelen ophalen, Unsplash), dan breekt de lus na 330 s netjes af: de niet verwerkte kandidaten worden niet als verwerkt gemarkeerd en komen in de volgende run terug; het aantal staat in `kandidatenTijdOvergeslagen` in de run en in de stapdetails (`tijdbudgetBereikt`). Test: `test/kandidaten.test.ts`.
4. **Let op de Unsplash-limiet**: `MAX_AANVRAGEN_PER_RUN` (36) blijft gelden en de demomodus is 50 aanvragen per uur. Met meer gepubliceerde berichten per run kan een bericht zonder foto blijven; stap 6b vult die in de volgende run aan. Bij 403 of 429 stopt de run met Unsplash zonder fout.
5. **Overheidsstroom**: Rijksoverheid NL is een nieuwe actieve bron. Nederlands binnenlands bestuur wordt vóór de synthese tegengehouden (R17, `lib/motor/overheidpoort.js` in nlfr-menu overgenomen als `lib/motor/overheidpoort.ts`); `aantallen.overheidR17` en `overheidCaribisch` tellen dat per run. Dit voegt aanbod toe zonder extra modelkosten voor wat toch wegvalt.

Te meten na een week: gepubliceerd per dag (doel 10 tot 20), `kandidatenTijdOvergeslagen` (moet 0 zijn), aandeel concepten per verwachtingsklasse. Pas bij een duidelijke uitkomst de beslisregels hierboven (drempels) heroverwegen.
