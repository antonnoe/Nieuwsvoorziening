# Beeldbank van Communities Abroad

Dit is de beeldbank met eigen illustraties van Communities Abroad, gemaakt bij het Nederlandstalige nieuws over Frankrijk. Alle beelden zijn eigen werk van Communities Abroad. De beeldbank wordt aangevuld; lees de lijst dus altijd opnieuw in plaats van een kopie te bewaren.

## Waar staat wat

- De lijst met alle beelden (JSON): https://nieuws.infofrankrijk.com/illustraties/index.json
- Dit document: https://nieuws.infofrankrijk.com/illustraties/LEESMIJ.md
- Overzichtspagina voor mensen: https://nieuws.infofrankrijk.com/beeldmateriaal
- De bestanden zelf staan onder /illustraties/ (de velden `svg` en `png` geven het pad, zet er https://nieuws.infofrankrijk.com voor).

## Opbouw van index.json

Bovenaan staat `afkomst` ("Illustratie door Communities Abroad") en daaronder `beelden`, een lijst. Elk beeld heeft deze velden:

- `id`: vaste unieke naam van het beeld, ook de bestandsnaam zonder extensie.
- `categorie`: de nieuwscategorie waar het beeld bij hoort: algemeen, politiek, economie en ondernemen, reizen en verkeer, natuur en rampen, toerisme en evenementen, of merkwaardig.
- `groep`: subcategorie binnen de categorie, bijvoorbeeld steden, symbolen, justitie, zorg, wegen en verkeer. Handig om snel de juiste hoek van de beeldbank te vinden.
- `naam`: korte naam van het beeld, in gewoon Nederlands. Deze naam gebruikt u in het onderschrift.
- `beschrijving`: één zin over wat er op het beeld staat en bij welke onderwerpen het past.
- `binding`: `fr` als het beeld bij Frankrijk hoort, `nl` als het bij Nederland of Nederlanders en Belgen hoort.
- `trefwoorden`: lijst woorden en korte zinnen waar het beeld op aansluit.
- `svg`: pad naar de SVG-versie (vectorbeeld).
- `png`: pad naar de PNG-versie.

## Advies: zo kiest u een beeld

1. Kies op onderwerp. Lees de `beschrijving` en de `trefwoorden` en neem het beeld dat het onderwerp van het bericht het best draagt. De `groep` helpt om het zoekgebied klein te maken; de `categorie` is een tweede hulpmiddel.
2. Gaat het bericht over Nederlanders of Belgen, of over Nederland, gebruik dan een beeld met `binding` `nl` als dat past. Past het niet, kies dan gewoon het beste beeld op onderwerp.
3. Gebruik PNG in e-mail en nieuwsbrieven (veel e-mailprogramma's tonen geen SVG), en SVG op websites.
4. Gebruik hetzelfde beeld niet bij berichten die vlak na elkaar verschijnen.

## Verplicht onderschrift

Zet bij elk gebruikt beeld het onderschrift, in deze vorm:

`<naam> · illustratie Communities Abroad`

Bijvoorbeeld: "Ambulance in de nacht · illustratie Communities Abroad". Gebruik de waarde van het veld `naam`, zonder categorie en zonder link.

## Rechten

Gebruik is vrij op de eigen platforms van Communities Abroad: Nederlanders.fr, Infofrankrijk, nieuws.infofrankrijk.com en Infopoche. Gebruik buiten die platforms is alleen toegestaan met schriftelijke toestemming van Communities Abroad.
