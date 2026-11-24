# Voorstel: welke nieuwsstroom vervalt en wanneer (24 november 2026)

**Status: voorstel. Er is niets uitgeschakeld. Uitvoeren pas na akkoord van Anton.** Basis: `docs/nieuwsstromen.md` (inventaris; wat niet verifieerbaar was heet daar hypothese).

## Voorstel in volgorde

| Stap | Stroom | Wat | Wanneer | Voorwaarden |
|---|---|---|---|---|
| 0 | Nieuwsvoorziening | Eerst op niveau brengen: 10 tot 20 berichten per dag, gecontroleerd via `/beheer` | nu | Drempelanalyse (docs/drempelanalyse.md) uitvoeren na 3 tot 5 dagen `/beheer` |
| 1 | frankrijknieuws ("Frankrijk vandaag") | Eerst vaststellen of iets het afneemt (Mailchimp, Ning-zijbalk, Zapier), dan de dagelijkse workflow uitzetten | zodra stap 0 7 dagen stabiel is | Bevestiging van Anton welke afnemers actief zijn (hypothese tot dan); afnemers eerst omleiden naar `/api/rss` of `/api/nieuws` van Nieuwsvoorziening |
| 2 | france-newsdesk | Feed `extern-frankrijknieuws.xml` vervangen door `https://nieuws.infofrankrijk.com/api/rss` in Laposta; workflow daarna uitzetten. De repo en `news_items` blijven bestaan | na 14 aaneengesloten dagen met >= 10 geplaatste berichten per dag | Laposta-sjabloon ingelezen door Anton of Claude (hypothese: er wordt nog uit gelezen); testmail met de nieuwe feed goedgekeurd; geen secties in de brief die van `news_items` afhangen |
| 3 | nlfr-menu persstroom + selectiestroom | Eerst de bronnen van `/api/actueel` laten lezen uit `/api/nieuws` van Nieuwsvoorziening (zodat Infopoche Nieuws, nieuwsbrief-tegels en nieuwspagina niet leeg vallen); daarna `/api/cron` en `/api/selectie-cron` uit `vercel.json` halen. Redactiepagina blijft voor Café Jeudi, banner, overheidspoort en verwijzingen | na 30 dagen stabiel, en pas als stap 2 klaar is | Infopoche-tab Nieuws en `/api/actueel` lezen aantoonbaar uit Nieuwsvoorziening (live gecontroleerd, met Origin-header van de app: zie de les over CORS uit het Cockpit-kader); zijbalk van Nederlanders.fr (FeedWind/`sidebar-nieuws`) heeft een vervanger of leest uit `/api/nieuws`; Anton heeft de redactietaak bewust losgelaten |
| 4 | Infopoche, tab Nieuws | Geen eigen stroom: schakelt mee op stap 3 (alleen de bron van `nieuws-lib.js` wijzigt, in if-mobiel, niet in deze opdracht) | met stap 3 | Zie stap 3 |
| 5 | nlfr-nieuwsbrief | Leest al `/api/tellingen` en `/api/peil` uit Nieuwsvoorziening. Opruimen: de oude bronnen in `lib/nieuwsbrief/bronnen.ts` (`ACTUEEL_URL` e.a.) pas weghalen na stap 3 | na stap 3 | Brief leest nergens meer `/api/actueel` (grep en testmail) |

## Voorwaarden in één regel (poort voor elke stap)

- Nieuwsvoorziening: `/api/status` toont `laatsteOogst` jonger dan 8 uur, en `/beheer` toont de afgelopen N dagen >= 10 geplaatst per dag, zonder dag met poortblokkades boven 30% van de pogingen.
- De leesroute van de afnemer (nieuwsbrief, Infopoche, nlfr-menu) leest aantoonbaar uit `/api/nieuws` of `/api/rss`, niet uit de oude stroom.
- Anton geeft per stap zijn akkoord.

## Risico's

1. **Te weinig aanbod**: bij 4 berichten per dag valt de nieuwspagina leeg zodra de oude stromen weg zijn. Daarom de teller van 10 per dag als harde voorwaarde.
2. **Verlies van redactionele sturing**: nlfr-menu heeft regels die Nieuwsvoorziening (nog) niet kent: Nederlands binnenlands bestuur alleen relevant als het Nederlanders in het buitenland raakt (R17), overheidspoort, Café Jeudi. Onderzoek voor stap 3 welke regels moeten worden overgenomen in `zeef.ts` en `synthese.ts`.
3. **Afnemers die we niet kennen** (Mailchimp, Zapier, Buffer, Ning): hypothese, uit codeopmerkingen. Verifiëren bij Anton voor uitzetten.
4. **Eén bron van storing**: Nieuwsvoorziening is dan het enige pad. Cockpit-punt 9 (versheidssignaal per schakel) is nu alleen een plek; voorstel: een controle op `/api/status` (`laatsteOogst`) in platform-monitor of Cockpit voordat de oude stromen uitgaan (alarm als de laatste oogst ouder is dan 8 uur).
5. **CORS en terugval op demodata**: afnemers in de browser (Infopoche) vallen stil terug als `Access-Control-Allow-Origin` ontbreekt. `/api/*` van Nieuwsvoorziening heeft CORS (CLAUDE.md); controleren met Origin-header van infopoche.fr.

## Terugweg

- Elke stap is omkeerbaar: een uitgezette GitHub-workflow gaat weer aan met "Enable workflow"; een uit `vercel.json` gehaalde cron staat in git en komt met een commit terug (de bestaande `vercel.cron-live.json` in nlfr-nieuwsbrief laat zien hoe zo'n kopie bewaard wordt).
- Bewaar tijdens de overgang de oude cron-regels als commentaarbestand in de repo (zoals `vercel.cron-live.json`).
- Schakel nooit meer dan één stroom per week uit; na elke stap 3 dagen meten.
- Data in `news_items` en de KV van nlfr-menu blijft staan; er wordt niets verwijderd.

## Niet in dit voorstel

Uitschakelen, wijzigen of herconfigureren van nlfr-menu, france-newsdesk, frankrijknieuws, nlfr-nieuwsbrief of Infopoche. Dat vraagt per stap een eigen opdracht na akkoord.
