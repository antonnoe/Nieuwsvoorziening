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
- Ontwerp volgens de goedgekeurde schets; geen sitenaam (besluit opdrachtgever), alleen klein label "Nieuws uit Frankrijk" links in de kop.
- Eén toevoeging aan de motor: `berichten({ peil })` in beide opslagvarianten (filter "Raakt uw portemonnee"), met test.
- Pagina 1 toont 1 uitgelicht + 12 kaarten; "Meer berichten" is een gewone link `?pagina=2` met 12 per pagina. Gefilterde en gepagineerde weergaven zijn noindex.
- Statusregel: bijgewerkt = tijd van de laatste run, berichten vandaag = telling uit opslag, bronnen = `bronnenOk` van de laatste run als die vandaag begon. Zonder data blijft de teller weg.
- Lege staat: "Het eerste nieuws verschijnt na de eerste oogst."

## Takenlijst
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
| Links netwerkbalk en knop Nieuwsbrief controleren (adressen zijn aannames) | open |
| Drempel en maxima ijken na enkele dagen | open |

## Voor de regisseur
1. Migratie toepassen op het Supabase-project communities-tools.
2. Vercel-project aanmaken op deze repo; variabelen zetten: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, CRON_SECRET (optioneel de overige uit `.env.example`).
3. Cron in `vercel.json` draait elk uur op `/api/cron/oogst`; Vercel stuurt het Bearer-geheim zelf mee zodra CRON_SECRET bestaat.
4. Eerste run controleren via `/api/status`, daarna drempel en bronnen bijstellen.
