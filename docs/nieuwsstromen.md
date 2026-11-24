# Nieuwsstromen van Communities Abroad (inventaris, alleen gelezen)

Stand 24 november 2026, opgesteld uit de CLAUDE.md, README's, workflows en `vercel.json` van de repo's (alleen gelezen, niets gewijzigd). Besluit B1 (REGIE.md): Nieuwsvoorziening wordt de enige nieuwsmotor.

Wat ik wel en niet kon controleren: de repo's zijn ondiepe klonen (één commit), de live sites en de opslagen (KV, Supabase) waren niet bereikbaar vanuit deze omgeving. Alles wat uit code en documentatie komt heet hier "volgens de repo". Wat ik niet kon verifiëren heet **hypothese**.

## Overzicht

| # | Stroom | Bron | Schema | Wie of wat publiceert | Waar Anton nu met de hand iets doet |
|---|---|---|---|---|---|
| 1 | **Nieuwsvoorziening** (deze repo) | ACTIVE-bronnen in `data/bronnen.json` (RSS/Atom, Franse, Belgische en Nederlandse pers en Franse overheid), artikeltekst als bronmateriaal, PEIL (alleen lezen) | Vercel cron 6 keer per dag op `/api/cron/oogst` (03, 07, 11, 15, 19, 23 uur UTC) | De motor zelf: eigen synthese, kwaliteitspoort, publicatie boven drempel 55 en relevantie 60, zonder menselijke klik. Publiek op nieuws.infofrankrijk.com en via `/api/nieuws`, `/api/rss`, `/api/tellingen`, `/api/peil` | Niets verplicht. Alleen controleren (daarvoor is `/beheer` gebouwd, zie C3) en bronnen/drempels bijstellen |
| 2 | **nlfr-menu, persstroom** (`/api/cron`, `/api/actueel`) | 16 feeds (pers, volgens `lib/feeds.js`), Rijksoverheid- en Franse overheidsthema's, Infofrankrijk-feed, verenigingsfeed | Vercel cron `/api/cron` elk uur op minuut 7 | Overheid: automatisch live na NL-samenvatting. Pers: synthese als concept (48 uur TTL), live pas na akkoord in de redactiepagina. `/api/actueel` bakt elk uur een snapshot | **Ja, dagelijks**: go/no-go op `/redactie` voor persberichten; plaatsing per kanaal (nieuwspagina, nieuwsbrief, Infopoche, zijbalk, Infofrankrijk) |
| 3 | **nlfr-menu, selectiestroom** (`/api/selectie-cron`, `/api/selectie-feed`, `/sidebar-nieuws`) | Nederlandse en Vlaamse pers, weerwaarschuwingen, overheidsberichten; voorselectie op PEIL | Vercel cron `/api/selectie-cron` elk uur op minuut 37 | De redactie (Anton) na voorstel van het model; goedgekeurd nieuws staat in de zijbalk van Nederlanders.fr (vervangt Feedspot-pinboard via FeedWind, volgens REGIE.md van nlfr-menu) | **Ja**: go/no-go per bericht op `/redactie`, elke dag |
| 4 | **nlfr-nieuwsbrief** (Laposta) | Infofrankrijk (WordPress REST), nlfr-menu (`/api/banner`, `/api/actueel`, `/api/actueel-tekst`), forum, if-plek, vervoersgroep, kalender, verenigingen-kalender, PEIL-export; sinds 23-11 ook `nieuws.infofrankrijk.com/api/tellingen` en `/api/peil` | Vercel cron `/api/cron/daily` 04:00 en 05:00 UTC (verzending 06:00 Nederlandse tijd); handmatige workflows `testmail.yml`, `verzend.yml`, `voorbeeld.yml` | De code bouwt en verstuurt de brief via Laposta zodra `NIEUWSBRIEF_LIVE=ja` staat. Nieuwsblok na het besluit van 23-11: telregel per categorie met link naar nieuws.infofrankrijk.com (geen eigen nieuwsselectie meer); PEIL-blok uit `/api/peil` | Beheer van de brief zelf (forum, Café Jeudi-banner via nlfr-menu). Het nieuws in de brief hoeft niet meer met de hand, zodra de oude secties echt weg zijn (volgens CLAUDE.md van de brief staat de nieuwe opzet op main sinds 23-11, de oude bouwstenen blijven in `test/oude-secties.ts`) |
| 5 | **france-newsdesk** | RSS/Atom-whitelist `data/sources.json` (11 actieve bronnen volgens `public/status.json` van 24-11 01:15 UTC) | GitHub Actions `publish-rss.yml`, cron `5 1 * * *` (01:05 UTC) en handmatig | De workflow commit `public/extern-frankrijknieuws.xml` naar de repo; GitHub Pages serveert die. Laposta leest de feed als externe RSS-bron (volgens CLAUDE.md van de repo). Een deel wordt gearchiveerd in `news_items` (Supabase) | Hypothese: het Laposta-sjabloon leest de feed en de nieuwsbriefredactie kiest eruit. Of dat nu nog in de verstuurde brief zit, kon ik niet verifiëren (het nieuwsblok van de brief leest sinds 23-11 uit Nieuwsvoorziening) |
| 6 | **frankrijknieuws** ("Frankrijk vandaag") | `feeds.txt` (12 regels, o.a. infofrankrijk.com, nederlanders.fr, francetvinfo.fr, lemonde.fr, lesechos.fr, service-public.fr, gouvernement.fr, insee.fr) | GitHub Actions `build.yml`, cron `10 6 * * *` (06:10 UTC) en handmatig | De workflow commit HTML, RSS (`frankrijk-daily.xml`), `sidebar.html`, `social.json` naar main. Volgens opmerkingen in `build_feed.py`: Mailchimp RSS-to-Email, Ning-zijbalk, Zapier/Buffer/Make (hypothese, niet geverifieerd). CLAUDE.md: stap "Commit results" heeft een verkeerde inspringing | Hypothese: niets met de hand, maar of de bouw nog slaagt en of er nog iets afneemt is onbekend. Het skill-kader (Cockpit, punt 9) noemt de repo "lijkt een voorganger"; status staat nog niet vastgelegd |
| 7 | **Infopoche, tab Nieuws** (if-mobiel) | `nlfr-menu` `/api/actueel` (thema-tegels: pers, overheid, infofrankrijk, verenigingen), `/api/actueel-tekst`, `/api/actueel-archief`; `nieuws-lib.js` | Geen eigen cron: de app haalt bij openen op | Niemand zelf; wat erin staat bepaalt nlfr-menu (kanaalkeuze `kanalen.infopoche` in `/redactie`). Berichten van één krant komen er nooit in (regel R01 en R02 in `lib/redactieregels.js` van nlfr-menu) | Indirect: alleen via de go/no-go in nlfr-menu (stroom 2). Het scherm toont niet automatisch Nieuwsvoorziening |
| 8 | **Cockpit** (aparte repo, niet beschikbaar in deze omgeving) | n.v.t. | n.v.t. | n.v.t. | Volgens het kader (skill cockpit-gezondheid, 10-09-2026) staat "actualiteit van de nieuwsketen" (punt 9) op prioriteit 2: alleen een plek in register en weergave, één versheidssignaal per schakel. Geen lijsten per dag van geplaatst, concept en geblokkeerd. Hypothese: dit is ongewijzigd, want de Cockpit-repo kon ik niet lezen |

## Wie bepaalt wat de lezer ziet (kort)

- Nieuws.infofrankrijk.com: alleen stroom 1, volledig automatisch.
- Nederlanders.fr-zijbalk, de nieuwspagina in nlfr-menu, de nieuwsbrief-tegels en Infopoche Nieuws: stroom 2 en 3, met handmatige go/no-go.
- Nieuwsbrief: sinds 23-11 een telregel naar Nieuwsvoorziening plus PEIL-blok uit Nieuwsvoorziening; de rest van de brief is los van nieuws.
- Externe RSS voor Laposta: france-newsdesk (stroom 5). Mailchimp/Ning/Zapier-afnemers van frankrijknieuws (stroom 6): hypothese.

## Overlap en dubbel werk

1. Stroom 2 en 3 (nlfr-menu) doen met een eigen keten wat Nieuwsvoorziening ook doet (feeds, clusteren, synthese, poort, PEIL-koppeling). Dat is de stroom met dagelijkse handmatige arbeid.
2. Stroom 5 en 6 zijn statische feeds zonder redactie; ze staan los van 2 tot en met 4.
3. Stroom 7 volgt stroom 2 en daarmee dus de handmatige go/no-go.

## Niet kunnen verifiëren

- Live status van elke stroom (de sandbox kon alleen de repo's lezen; netwerk naar de live sites was dicht).
- Of Laposta/Mailchimp/Ning/Zapier nu nog uit france-newsdesk of frankrijknieuws lezen.
- Hoeveel berichten per dag nlfr-menu nu live zet.
- Of de Cockpit de nieuwsketen al meet (repo niet beschikbaar).
