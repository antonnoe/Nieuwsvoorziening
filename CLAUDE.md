# CLAUDE.md

Repo: nieuwsvoorziening

## Wat dit is
De nieuwsmotor van Nieuwsvoorziening, de toekomstige enige nieuwsmotor van Communities Abroad: Nederlandstalig nieuws over Frankrijk voor Nederlanders en Belgen. De motor, een openbare data-API en de publieke pagina's van nieuws.infofrankrijk.com (server-side gerenderd, lezen direct uit de opslag).

## Opbouw
- `lib/motor/`: de motor (alle logica)
  - `feeds.ts` (RSS/Atom lezen, oogst), `artikel.ts` (artikeltekst als bronmateriaal, letterlijk-check), `zeef.ts` (sport, faits divers, buitenland, Frankrijk-filter), `cluster.ts` (heuristiek + goedkoop model), `synthese.ts` (Nederlandse tekst per onderwerp), `poort.ts` (kwaliteitspoort), `score.ts`, `peil.ts` (PEIL-koppeling), `beeld.ts` (generator-interface), `beeld-unsplash.ts` (Unsplash), `opslag.ts` (Supabase via REST, plus geheugenopslag voor tests en droge runs), `motor.ts` (de run), `api.ts`, `rss.ts`, `cron-auth.ts`, `config.ts`, `tijd.ts`
- `app/api/`: `nieuws`, `nieuws/[id]`, `tellingen`, `rss`, `status` (openbaar, alleen lezen, CORS), `cron/oogst` (achter Bearer CRON_SECRET)
- `app/`: publieke pagina's: `page.tsx` (voorpagina, filters `?categorie=` `?peil=1` `?pagina=`), `bericht/[id]/page.tsx`, `werkwijze/page.tsx`, `sitemap.ts`, `robots.ts`, `layout.tsx` (netwerkbalk, kop, voet), `_componenten/` (Kaart, PeilRegel); `huisstijl.css` (letterlijke kopie van docs/huisstijl/huisstijl.css, nooit eigen kleuren, letters of afrondingen toevoegen), `site.css` (alleen wat huisstijl.css niet dekt, met de variabelen daaruit); `lib/site.ts` (leeshulpjes, datums, tellers); `lib/netwerkbalk.ts` (enige bron van de netwerkbalk en de Nieuwsbrief-URL); `_componenten/` ook Kop en Netwerkbalk
- `data/bronnen.json`: bronnenlijst (status ACTIVE of CONCEPT), samengesteld uit nlfr-menu en france-newsdesk; `data/config.json`: drempels
- `supabase/migrations/`: tabellen (`nv_berichten` met `beeld_credit` sinds 23-11-2026), `nv_bron_items`, `nv_bronnen_per_bericht`, `nv_peil_signalen`, `nv_oogst_runs`, `nv_peil_lezerszin`
- `test/`: tests; `scripts/droge-run.ts`: droge run (`npm run droog`)
- `vercel.json`: cron 6 keer per dag op `/api/cron/oogst` (03, 07, 11, 15, 19 en 23 uur UTC, besluit 23-11-2026)

## Techniek
Next.js (app router) + TypeScript op Vercel. Tests `npm test` (tsx, node --test), `npm run typecheck`, `npm run build`. Enige runtime-afhankelijkheid naast Next en React: `@anthropic-ai/sdk`. Supabase wordt via de REST-interface aangesproken (geen client-bibliotheek).

## Externe diensten en namen van omgevingsvariabelen
- Supabase (project communities-tools, ref mqkhfyvrizgmmmcbdkxh, alleen nieuwe `nv_`-tabellen): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Anthropic API: `ANTHROPIC_API_KEY`; modellen via `NIEUWS_MODEL_SYNTHESE` (standaard claude-sonnet-5-5) en `NIEUWS_MODEL_GOEDKOOP` (standaard claude-haiku-4-5, voor clustering en PEIL-oordeel)
- Cron: `CRON_SECRET` (zonder deze waarde is de cron-route altijd dicht)
- Optioneel: `PUBLICEER_DREMPEL` (overrulet data/config.json), `BEELD_GENERATOR` (leeg is geen beeld), `NIEUWS_BASIS_URL` (voor links in de RSS), `PEIL_URL`
- PEIL: https://communitiesabroad.com/manifest/peil-zoek.json (alleen gelezen)

## Regels en besluiten
- Bronnen: alleen status ACTIVE wordt opgehaald; een nieuwe bron begint als CONCEPT tot de feed is gecontroleerd. Geen sport tenzij praktische gevolgen; ontdubbelen op url.
- Een bericht heeft minimaal 2 onafhankelijke bronnen (liefst 3); een overheidsbron (.gouv, regime overheid) mag 1 bron zijn.
- Eigen Nederlandse tekst, kop en samenvatting; categorie precies één van: algemeen, politiek, economie en ondernemen, reizen en verkeer, natuur en rampen, toerisme en evenementen, merkwaardig. Bronnenblok met per bron naam, originele kop, datum, url. In kop en tekst nooit een krantennaam of perslink, ook niet als het medium zelf onderwerp is (dan omschrijven, besluit 23-11-2026); geen persfoto's. Het model krijgt de bronnen geanonimiseerd (Bron 1, 2, 3).
- De motor leest kop, omschrijving en (sinds besluit 23-11-2026) de artikeltekst van hooguit 4 bronnen per onderwerp als bronmateriaal (`artikel.ts`). De artikeltekst wordt nooit opgeslagen en nooit letterlijk overgenomen: de poort blokkeert elke reeks van 10 woorden uit een bron. Teksten 200 tot 300 woorden, met een slotalinea "Wat betekent dit voor u:" alleen als de bronnen een concreet gevolg noemen.
- Kwaliteitspoort vóór publicatie (`poort.ts`, getest): geen meta-taal over de invoer, geen krantennamen buiten het bronnenblok, geen lege of te korte tekst, geen links, geen bedrag dat niet in een bron staat.
- Automatisch publiceren boven de drempel (data/config.json, `publiceerDrempel`) én met een relevantie van minstens `minRelevantie` (50), zonder menselijke klik. Lokale politieke of gerechtelijke affaires rond personen scoren laag (besluit 23-11-2026). Richtgetal 10 tot 20 berichten per dag; harde bovengrens `maxBerichtenPerDag`.
- Vak "Wat verandert er voor u" (besluit 23-11-2026, `lib/peilvak.ts`, `_componenten/PeilVak.tsx`): op de voorpagina (pagina 1, zonder categorie) de eerstvolgende 4 aangekondigde wijzigingen uit de PEIL-export (`aangekondigd`), met datum, een leesbare zin (keuze A: het goedkope model herschrijft de PEIL-omschrijving in `lezerszin.ts`, bewaard in `nv_peil_lezerszin` met de hash van de omschrijving, alleen opnieuw bij wijziging; elk getal moet in de omschrijving staan, anders de ingekorte omschrijving zelf), "Nog niet definitief" bij een raming en de tools die ermee rekenen; zonder gegevens geen vak.
- PEIL wordt nooit aangepast. Een mogelijk gewijzigde waarde wordt een signaal in `nv_peil_signalen` met status `gesignaleerd`. Lezers zien alleen "wordt nagelopen", niet de toelichting.
- Beeld: Unsplash is de standaardbron (besluit 23-11-2026, `beeld-unsplash.ts`), actief zodra `UNSPLASH_ACCESS_KEY` bestaat; `BEELD_GENERATOR=uit` zet het uit. Regels van Unsplash: hotlinken (urls.regular), download-eindpunt aanroepen bij gebruik, fotograaf en Unsplash met link vermelden (`beeld_credit`, getoond onder elk beeld). Zoekterm komt uit de synthese (Engels, plek of situatie, nooit een persoon); terugval per categorie. Berichten zonder beeld krijgen er bij de volgende oogst alsnog een (hooguit 6 per run). AI-illustraties zijn een mogelijke tweede generator (sleutel nodig), altijd met vermelding "AI-illustratie".
- Elke externe stap (bron, Anthropic, Supabase, PEIL) faalt netjes zonder de rest te breken. Ruwe items ouder dan 30 dagen worden opgeruimd.
- In `news_items` (bestaande tabel) wordt nooit geschreven of gewijzigd.
- Schrijfstijl: gewoon Nederlands, komma's in plaats van lange streepjes.

- Publieke pagina's: geen eigen sitenaam of merk; tellers in de statusregel komen uit de opslag en worden weggelaten als er geen data is; krantennamen alleen in het bronnenblok; zonder `beeld_url` een rustig beeldvlak zonder tekst. Huisstijl: docs/huisstijl/ (RICHTLIJNEN, huisstijl.css, schetsen); lettertypen Manrope en Source Serif 4 via de Google Fonts-URL uit de kop van huisstijl.css, geen Inter. Koppen met kleine letters (alleen eerste woord hoofdletter). Kop: geen sitenaam en geen ondertitel (besluit opdrachtgever 23-11-2026), alleen het woord Nieuws. Open keuken: alleen echte gegevens; Kort en Bijgewerkt op de artikelpagina alleen als het bericht die gegevens heeft (nu niet).

## Harde grenzen
nlfr-menu, france-newsdesk, verenigingen-kalender en Café Claude worden nooit gewijzigd, alleen gelezen. Geen sleutels kopiëren, geen waarden van omgevingsvariabelen in code. Migraties worden niet door de bouwer toegepast; dat doet de regisseur.

## Laatst nagelopen
Laatst nagelopen: 23 november 2026
