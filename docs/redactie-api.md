# Redactie-API (contract, 26 november 2026)

Voor de redactietool in nlfr-menu (/redactie). Basis: het adres van Nieuwsvoorziening (https://nieuws.infofrankrijk.com), pad `/api/redactie`.

## Toegang
- Elke aanroep: header `Authorization: Bearer <CRON_SECRET>`. Zonder ingestelde CRON_SECRET is de route dicht (503).
- nlfr-menu authenticeert met zijn eigen variabele `NV_REDACTIE_SECRET`. De waarde daarvan is gelijk aan `REDACTIE_SECRET` van Nieuwsvoorziening (eigen sleutel, alleen voor deze route); zonder REDACTIE_SECRET valt de route terug op `CRON_SECRET`. Een verkeerde waarde geeft 401.
- Fout geheim: 401. Na 5 foute pogingen binnen 10 minuten vanaf hetzelfde adres: 429.
- CORS: alleen `https://nlfr-menu.vercel.app` (preflight OPTIONS ondersteund; toegestane headers `authorization`, `content-type`). Antwoorden zijn `no-store`.
- Foutvorm altijd: `{"fout": "<gewone taal>"}`.
- Zolang de migratie `20261126120000_nv_kanalen_redactie.sql` niet is toegepast werkt GET met standaardwaarden; `weg`, `terug`, `kanaal` en `bewerk` geven dan 503 (`fout` noemt de migratie).

## GET /api/redactie?dagen=2
`dagen`: 1 tot 30 (standaard 2). Geeft ALLE berichten van de laatste N dagen (nieuwste eerst, hooguit 500): geplaatst, concept, geblokkeerd en `weg`.

```
{
  "dagen": 2,
  "aantal": 31,
  "aantalNietGeplaatst": 18,
  "laatsteRun": { "gestartOp": ISO, "klaarOp": ISO|null, "droog": bool, "aantallen": { ... }, "fouten": [tekst] } | null,
  "berichten": [ Bericht, ... ]
}
```
`laatsteRun` voedt de statusregel "De nieuwsmotor loopt, laatste ronde ..." (`aantallen` o.a. gepubliceerd, concept, geblokkeerd, kandidaten, bronnenOk, overheidR17). `null` als de runs niet leesbaar zijn.

### Bericht (GET en antwoord van POST)
| veld | type | betekenis |
|---|---|---|
| id | string | uuid |
| kop, samenvatting | string | huidige tekst |
| categorie | string | een van de zeven categorieen |
| status | "gepubliceerd" / "concept" / "geblokkeerd" | stand van de motor |
| geplaatst | bool | status is gepubliceerd |
| reden | string / null | waarom het niet geplaatst staat, gewone taal ("Kwaliteitspoort: ..." of score en relevantie onder de drempel); null als geplaatst |
| redenTekst | string / null | één zin in gewone taal voor een niet-technische beheerder, zonder getallen of drempels; null als geplaatst. Vaste zinnen: "Te weinig van belang voor onze lezers.", "De tekst noemt een krant.", "De tekst lijkt te veel op het origineel.", "Maar één bron gevonden.", "De tekst is te kort.", "De tekst praat over zijn eigen bronnen.", "Niet geplaatst door de controle." (onbekend). `reden` blijft de technische variant |
| kanPlaatsen | bool | actie `plaats` zal slagen (concept, geen poortblokkade, niet op weg) |
| score | getal | score 0 tot 100 |
| blokkadeRedenen | [string] | ruwe redenen van de poort of herschrijfcontrole |
| soort | "overheid" / "pers" | |
| domein | string / null | domein van de bron, alleen bij overheid |
| kanalen | {actueel, nieuwsbrief, infopoche, zijbalk, infofrankrijk: bool} | |
| redactie | "weg" / null | redactiebesluit |
| redactieOp | ISO / null | tijdstip van dat besluit |
| handmatigOp | ISO / null | tijdstip van een handmatige correctie; daarna schrijft de motor het bericht nooit meer om of over |
| herschrijfGemarkeerd | bool | actie `herschrijf` is gegeven en de volgende oogst schrijft het opnieuw |
| portemonnee | bool | |
| gepubliceerdOp | ISO | |
| beeldUrl | string / null | |
| bronnen | [{naam, origineleKop, datum, url}] | |

## POST /api/redactie
Body (JSON) met `id` en `actie`. Antwoord 200: `{"bericht": Bericht}` (de stand na de actie). 400 bij een ongeldige body, 404 als het bericht niet bestaat, 409 als de actie nu niet kan.

| actie | extra velden | effect |
|---|---|---|
| "weg" | | `redactie = "weg"`: het bericht verschijnt nergens meer (API, RSS, voorpagina, sitemap) |
| "terug" | | haalt "weg" terug |
| "kanaal" | `kanaal` (een van de vijf), `aan` (bool) | zet een kanaal aan of uit |
| "plaats" | | zet status op gepubliceerd. Alleen als de kwaliteitspoort geen blokkade gaf (status geblokkeerd, of een concept met een poortreden: 409 met uitleg). 409 ook als het al geplaatst staat of op weg staat. Een concept dat alleen onder de score- of relevantiedrempel bleef, of dat bij herschrijven op relevantie afviel, kan wel |
| "herschrijf" | | markeert het bericht (regelversie 0); stap 6a van de volgende oogst schrijft het opnieuw, ook een concept en ook ouder dan 48 uur, hooguit 3 per run. Het wordt nu niet zelf herschreven. 409 bij een handmatig aangepast bericht |
| "bewerk" | minstens een van `kop` (5 tot 300), `samenvatting` (10 tot 1500), `tekst` (20 tot 20000), `categorie` | past het bericht aan en zet `handmatigOp`. Dit bericht wordt daarna NOOIT meer automatisch herschreven of overschreven door de motor (ook niet na `herschrijf` of een nieuwe regelversie). Een bewerking gaat niet opnieuw door de kwaliteitspoort |

## Overige velden in de publieke API (alleen toegevoegd, achteraan)
`/api/nieuws` en `/api/nieuws/[id]` geven `soort`, `domein` en `kanalen` mee; `/api/nieuws?kanaal=<naam>` toont alleen berichten waarvan dat kanaal aan staat (onbekende naam: 400). Berichten met `redactie = "weg"` komen er niet in.
