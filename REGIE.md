# Regie-logboek nieuwsvoorziening

## Besluiten (opdracht regisseur, 23 november 2026)
- B1. Nieuwsvoorziening wordt de enige nieuwsmotor van Communities Abroad; deze repo bevat alleen motor en data-API, geen publieke pagina's.
- B2. Next.js + TypeScript op Vercel; opslag in Supabase communities-tools met nieuwe `nv_`-tabellen; `news_items` blijft onaangeroerd.
- B3. Zeven categorieën, minimaal 2 (liefst 3) bronnen, overheid mag 1; geen krantennaam of perslink in kop of tekst; geen persfoto's.
- B4. Automatisch publiceren boven een drempel in config, 10 tot 20 berichten per dag.
- B5. PEIL: voorselectie op trefwoorden, dan modeloordeel; gewijzigde waarde wordt een signaal; PEIL zelf wordt nooit aangepast.
- B6. Beeld: alleen `beeld_url` en een generator die standaard uit staat; beeldbron is nog een besluit.
- B7. Modelnaam via env; Sonnet voor synthese, goedkoper model voor clustering en PEIL-oordeel.

## Keuzes van de bouwer (afwijkingen en aanvullingen, met reden)
- Supabase via REST (fetch) in plaats van supabase-js: één afhankelijkheid minder, minder breekbaar.
- Clustering in twee lagen: heuristiek op gedeelde kernwoorden (werkt zonder model) en een goedkoop model dat ook over talen heen groepeert. De heuristiek vindt geen Nederlands-Franse overlap; dat doet alleen het model.
- Dubbele onderwerpen over runs heen: een nieuw cluster wordt overgeslagen als zijn bronkoppen sterk lijken op de bronkoppen van een bericht van de laatste 48 uur. Werkt alleen binnen dezelfde taal; Frans-Nederlandse dubbelen kan alleen het model voorkomen (open punt).
- Score = 50% relevantie (oordeel van het model), 30% aantal bronnen, 20% versheid; standaarddrempel 55. Het is een startwaarde, te ijken na de eerste echte dagen.
- Een afgekeurde synthese krijgt één herkansing met de redenen erbij. Blijft ze afgekeurd, dan status `geblokkeerd` (niet openbaar), de bronitems gelden als verwerkt.
- Onder de drempel wordt het bericht `concept` (niet openbaar).
- `/api/nieuws/[id]` toont het bronnenblok en de PEIL-koppeling; de publieke vorm bevat geen score, blokkaderedenen of toelichting van signalen.
- RSS-links wijzen naar `NIEUWS_BASIS_URL/bericht/<id>` (standaard https://nieuws.infofrankrijk.com); die pagina's maakt de andere sessie. De GUID is het bericht-id.
- "Vandaag" in `/api/tellingen` is de kalenderdag in Europe/Amsterdam.

## Publieke pagina's (bouwer, 23 november 2026)
- Ontwerp volgens de goedgekeurde schets en huisstijl (docs/huisstijl, 23-11-2026); geen sitenaam en geen ondertitel (besluit opdrachtgever, gaat vóór de richtlijn), de kop toont alleen het woord Nieuws in serif.
- Eén toevoeging aan de motor: `berichten({ peil })` in beide opslagvarianten (filter "Raakt uw portemonnee"), met test.
- Pagina 1 toont 1 uitgelicht + 12 kaarten; "Meer berichten" is een gewone link `?pagina=2` met 12 per pagina. Gefilterde en gepagineerde weergaven zijn noindex.
- Statusregel: bijgewerkt = tijd van de laatste run, berichten vandaag = telling uit opslag, bronnen = `bronnenOk` van de laatste run als die vandaag begon. Zonder data blijft de teller weg.
- Lege staat: "Het eerste nieuws verschijnt na de eerste oogst."

## Huisstijl (bouwer, 23 november 2026)
- app/huisstijl.css is letterlijk docs/huisstijl/huisstijl.css; site.css bevat alleen aanvullingen met die variabelen. Inter is weg.
- Klassen volgens de schetsen (.net, .kop, .keuken, .pil, .hoofd, .raster, .kaart, .peil, .voet, .meer, .art, .zij, .paneel, .verder). Netwerkbalk uit lib/netwerkbalk.ts.
- Artikelpagina: Open keuken toont Geplaatst, Gecontroleerd (ja, want elk gepubliceerd bericht passeerde de poort) en Correcties (link). Bijgewerkt en Kort ontbreken: geen gegevens. Beeldbijschrift ontbreekt om dezelfde reden.
- Verder lezen: drie berichten uit dezelfde categorie, dan met dezelfde PEIL-parameter (herstelronde 1), dan de nieuwste.
- Werkwijze en 404 gebruiken dezelfde kop en kolom.

## Takenlijst
## D2: Infopoche leest /api/nieuws (bouwer, 24 november 2026)
CORS toegestaan voor https://infopoche.fr (alleen https, kale host; www.infopoche.fr niet toegevoegd omdat het bestaan niet bevestigd is). `/api/nieuws` ondersteunt `?peil=1` (dezelfde opslagfilter als de voorpagina, inclusief kolom `portemonnee`). Publieke vorm kreeg `portemonnee` (boolean); `peil.raakt` met `wordtNagelopen` bestond al en is ongewijzigd. Geen migratie. Tests in `test/api.test.ts` en `test/nieuws-route.test.ts`.

| Taak | Status |
|---|---|
| Motor: oogst, zeef, clustering, synthese, poort, score, PEIL, beeld, opslag | gebouwd, getest met nepbronnen en nepmodel |
| Data-API en cron-route | gebouwd, route-rooktest zonder opslag (503 en 401 zoals bedoeld) |
| Migratie `supabase/migrations/20261123120000_nieuwsvoorziening_nv_tabellen.sql` | geschreven, NIET toegepast (regisseur) |
| Echte synthese met Anthropic | ongetest (geen sleutel in de bouwomgeving) |
| Echte Supabase-schrijfroute | alleen getest tegen een nep-fetch |
| Bronnenlijst nalopen (8 bronnen gaven HTTP 403 vanuit de bouwomgeving) | open, controleer vanaf Vercel |
| CONCEPT-bronnen (o.a. buitenlandse pers, RFI, RTBF, RTL) feeds controleren en activeren | open |
| Beeldbron kiezen en generator aansluiten | open besluit |
| Dubbele onderwerpen over talen heen | open |
| Publieke pagina's (voorpagina, bericht, werkwijze, sitemap, robots) | gebouwd 23-11-2026, getest tegen een nep-Supabase lokaal; nog niet live gezien met echte data |
| Domein nieuws.infofrankrijk.com aan Vercel koppelen, NIEUWS_BASIS_URL zetten | open (regisseur) |
| Links netwerkbalk en knop Nieuwsbrief | adressen gecontroleerd door opdrachtgever 23-11-2026 |
| Drempel en maxima ijken na enkele dagen | open |

## Voor de regisseur
1. Migratie toepassen op het Supabase-project communities-tools.
2. Vercel-project aanmaken op deze repo; variabelen zetten: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, CRON_SECRET (optioneel de overige uit `.env.example`).
3. Cron in `vercel.json` draait 6 keer per dag op `/api/cron/oogst` (elke 4 uur, besluit 23-11-2026); Vercel stuurt het Bearer-geheim zelf mee zodra CRON_SECRET bestaat.
4. Eerste run controleren via `/api/status`, daarna drempel en bronnen bijstellen.

## Herstelronde 1 (bouwer, 23 november 2026)
Punten A tot H van de keurders hersteld; zie CLAUDE.md voor de regels. Migratie `20261123180000_nv_portemonnee.sql` (alleen `add column if not exists`, kolom al aangemaakt door de regisseur). Getest met nagebootste modelantwoorden en een nep-Supabase; niets met echte sleutels.

## Herstelronde 2 (bouwer, 23 november 2026)
Punten 1 tot 4 van de keurders hersteld (herschrijven van oude berichten, beeldfilter met France en drempel 7, korte titels in het PEIL-vak, tekst bij leeg €-filter); zie CLAUDE.md. Migratie `20261123190000_nv_regelversie_titel.sql` (alleen `add column if not exists`, kolommen al aangemaakt door de regisseur). Getest met nagebootste modelantwoorden, nep-Unsplash en geheugenopslag; niets met echte sleutels. Keuze: bij een modelfout tijdens het herschrijven blijft het bericht op regelversie 1 staan en probeert de volgende run het opnieuw.

## Peil-teller (bouwer, 24 november 2026)
`/api/peil/teller`: openbaar, alleen lezen, CORS en cache (1 uur) als de andere openbare routes. Onderzocht in de echte export (300 parameters): PEIL houdt geen aanmaakdatum per parameter bij (alleen `verificatiedatum`, `geldig_van`, `volgende_controle`; `geldig_van` is een ingangsdatum van de regel). Daarom telt de route alleen "bijgewerkt" (verificatiedatum in de kalendermaand of het kalenderjaar, Europe/Amsterdam) en bestaat "toegevoegd" niet in de uitvoer. Let op: een verificatiedatum is ook een nagelopen-datum zonder wijziging; bij de ijk van 20-10-2026 kregen 198 van 300 parameters dezelfde datum, dus de maandtelling schommelt met controlerondes en zegt niets over aantal wijzigingen. Bij PEIL-storing: laatst bekende stand met `verouderd: true`, zonder stand een 503 in gewone taal.

## Taak C: nieuwsstromen, drempel, beheer (bouwer, 24 november 2026)
- C1: inventaris van acht stromen in docs/nieuwsstromen.md (alleen gelezen; repo's waren ondiepe klonen, live niet bereikbaar, onbewezen punten heten hypothese).
- C2: drempels NIET gewijzigd. De live API (nieuws.infofrankrijk.com) was vanuit de bouwomgeving niet bereikbaar (proxy 403 en host buiten toegestane domeinen), dus geen eigen meting. Uit de scoreformule volgt dat `minRelevantie` (60) de beperkende eis is, niet `publiceerDrempel` (55). Besluitregels voor na 3 tot 5 dagen `/beheer` staan in docs/drempelanalyse.md.
- C3: Cockpit dekt dit niet (kader 10-09-2026: nieuwsketen prioriteit 2, alleen een plek; Cockpit-repo niet beschikbaar, hypothese), dus `/beheer` gebouwd in deze repo (cookie-inlog, geen sleutel in de URL). Geen migratie nodig. Open: relevantie per bericht bewaren (migratie, voorstel in drempelanalyse).
- C4: voorstel in docs/voorstel-nieuwsstromen.md; niets uitgeschakeld; wacht op akkoord van Anton.
| Taak | Status |
|---|---|
| Beheerpagina /beheer | gebouwd, getest met geheugenopslag; niet live gezien met echte data |
| Drempel ijken met echte dagen | open, eerst /beheer 3 tot 5 dagen laten lopen |
| Stroomvoorstel C4 | wacht op akkoord Anton |
