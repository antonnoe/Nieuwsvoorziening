# Drempelanalyse (24 november 2026)

## Uitkomst

**Er is niets aangepast in `data/config.json`.** Er is te weinig data om een wijziging te onderbouwen: de live API was vanuit deze omgeving niet bereikbaar en de motor bewaarde tot nu toe nergens waar een beheerder per dag kon zien wat concept of geblokkeerd bleef. Een drempel verlagen zonder te weten waar de berichten blijven hangen is raden, en kan kwaliteit kosten (de poort blijft ongemoeid, maar `publiceerDrempel` en `minRelevantie` zijn de enige kwaliteitsfilters na de poort).

## Meting

| Wat | Resultaat |
|---|---|
| `https://nieuws.infofrankrijk.com/api/status`, `/api/tellingen?uren=24`, `/api/nieuws` | Niet bereikbaar. curl: proxy weigert (HTTP 403, CONNECT); WebFetch: host buiten de toegestane domeinen (ENOTFOUND). Dus geen eigen meting |
| Supabase (`nv_berichten`, `nv_oogst_runs`) | Niet gebruikt. De opdracht zei: alleen de openbare API; die was dicht |
| Het enige harde cijfer | De opdracht: de laatste 24 uur gaf `/api/tellingen` 4 berichten, doel 10 tot 20 per dag. Bron daarvan niet door mij gecontroleerd |

## Wat de code zegt (geen meting, structuur)

Uit `lib/motor/motor.ts` en `data/config.json`:

1. Een bericht ontstaat pas na vier filters: de zeef (sport, faits divers, buitenland), minstens 2 onafhankelijke bronnen (overheid 1), geen duplicaat van de laatste 48 uur, en een plaats in de run (`maxSynthesesPerRun` = 6).
2. Daarna publiceert de motor alleen als `score >= publiceerDrempel` (55) EN relevantie `>= minRelevantie` (60) EN de poort slaagt. Score = 0,5 x relevantie + 0,3 x bronscore + 0,2 x versheid (`lib/motor/score.ts`; bronscore pers: 35 bij 1, 65 bij 2, 90 bij 3 of meer bronnen; versheid 100 bij een net verschenen bericht tot 0 na 36 uur). Gerekend uit de formule (geen meting): een pers-cluster met 2 bronnen haalt 55 bij een relevantie van ongeveer 31 (net verschenen) tot 44 (12 uur oud), met 3 bronnen al bij ongeveer 16 tot 29. De harde eis `minRelevantie` = 60 is dus de beperkende factor, niet `publiceerDrempel` = 55: wie 55 verlaagt, verandert vrijwel niets.
3. Een cluster dat concept of geblokkeerd wordt, geldt als verwerkt en komt nooit terug. Dus elk concept is definitief verloren voor publicatie.
4. Plafonds: 6 syntheses per run, 6 runs per dag, dus hoogstens 36 pogingen en `maxBerichtenPerDag` = 20. Het plafond van 20 is niet de beperking bij 4 per dag.
5. Het richtgetal 10 tot 20 per dag is bij 6 syntheses per run alleen haalbaar als ongeveer een derde van de pogingen slaagt (hypothese: 6 × 6 = 36 pogingen, 10 vereist 28% succes).

## Verklaring (hypothesen, in volgorde van waarschijnlijkheid, alle ongetest)

1. Te weinig clusters met 2 onafhankelijke bronnen (dubbele zeef plus talen heen: de heuristiek clustert alleen binnen één taal, REGIE.md "open punt").
2. Te veel concepten door relevantie < 60 (volgens de formule de beperkende eis) of score < 55 (zelden) (herstelronde 1 verhoogde `minRelevantie` naar 60 en verlaagde bewust landelijke politiek, beurs en regio Parijs).
3. Poortblokkades (10-woordenregel, krantennaam, bedrag niet in bron, minder dan 2 alinea's) bij lange teksten.
4. Het maximum van 6 syntheses per run, bij runs die (zie commit c18bea6) tegen de tijdgrens aanliepen.

## Wat nodig is om te onderbouwen

1. Per dag het aantal berichten per status plus score en reden: dat is nu zichtbaar op `/beheer` (C3). Wacht 3 tot 5 dagen met `/beheer`.
2. De trechter per run (kandidaten, geplaatst, concept, geblokkeerd, synthese mislukt, bronnen in orde): staat ook op `/beheer`, uit `nv_oogst_runs.aantallen`.
3. De relevantie van een concept wordt niet apart bewaard; bij een concept zonder poortreden is niet te zien of de score of de relevantie de drempel miste. Voorstel voor later (niet nu gebouwd, het vraagt een migratie): kolom `relevantie` op `nv_berichten`.
4. Toegang tot de live API vanuit de bouwomgeving (host `nieuws.infofrankrijk.com` toestaan), of de status-JSON van een dag handmatig aanleveren.

## Beslisregels voor na die 3 tot 5 dagen (voorstel)

- Zijn de meeste concepten tussen score 45 en 54 met relevantie >= 60: `publiceerDrempel` van 55 naar 50 (bescheiden stap van 5), dan 3 dagen meten. Verwacht weinig effect, zie punt 2 hierboven.
- Zijn de meeste concepten onder relevantie 60 met score >= 55: `minRelevantie` van 60 naar 55, dan 3 dagen meten. Niet verder dan 50.
- Zijn er weinig concepten en weinig kandidaten: dan zit het probleem bij bronnen en clustering, niet bij drempels. Bronnen activeren (CONCEPT naar ACTIVE) of de Frans-Nederlandse clustering verbeteren.
- Zijn de pogingen steeds 6 per run en slagen er bijna allemaal: `maxSynthesesPerRun` van 6 naar 8.
- Houd na elke stap steeds `/beheer` open op geblokkeerd: stijgt het aandeel poortblokkades, dan terug.
- `REGELVERSIE` blijft 2; de poort blijft ongemoeid.
