# richtlijnen huisstijl, nieuwshub

Voor wie de nieuwshub (nieuws.infofrankrijk.com) bouwt. Deze richtlijnen gelden daarna ook voor de andere sites en tools van Communities Abroad.

Status: schetsen van voorpagina, artikelpagina en telefoonweergave zijn door Anton bekeken op 23-11-2026. Stijlrichting B is door Anton gekozen op 22-11-2026.

## wat bij dit bestand hoort

- `huisstijl.css`: de enige bron voor kleuren, letters, maten en onderdelen.
- `schets-voorpagina.html` en `schets-artikelpagina.html`: werkende voorbeelden, ook op telefoonbreedte.
- `schets-voorpagina.png`, `schets-artikelpagina.png`, `schets-telefoon.png`: zo moet het eruitzien.

Bij twijfel geldt: eerst `huisstijl.css`, dan de HTML-schetsen, dan de afbeeldingen.

## harde regels

1. Gebruik alleen de variabelen uit `huisstijl.css`. Geen nieuwe kleuren, geen andere letters, geen andere afrondingen.
2. Koppen in Source Serif 4, alle overige tekst in Manrope. Geen Poppins, Mulish, Inter of systeemletters.
3. Koppen met kleine letters, alleen het eerste woord met een hoofdletter.
4. De bovenbalk (netwerkbalk) is op elke site en tool exact gelijk: zelfde namen, zelfde volgorde, zelfde maten. Alleen de markering van de huidige plek verschilt. De balk komt uit één bron, niet per site gekopieerd.
5. De kop is wit met de naam in serif. Geen rood vlak als kop. Maroon alleen in de netwerkbalk, in de hoofdknop, in rubrieklabels en in links.
6. Groen (`--groen`) alleen voor PEIL-meldingen, "Raakt uw portemonnee" en het vinkje bij gecontroleerd.
7. Veel wit en ruimte. Liever een onderdeel weglaten dan de pagina vol zetten. Kernfuncties blijven wel zichtbaar zonder scrollen.

## kleuren

| naam | waarde | gebruik |
|---|---|---|
| `--maroon` | #800000 | netwerkbalk, hoofdknop, rubrieklabel, links |
| `--wit` | #faf7f4 | achtergrond van de pagina |
| `--kaart` | #ffffff | kaarten, kop, panelen |
| `--inkt` | #1f1a18 | tekst, actieve rubriekknop |
| `--grijs` | #6f6660 | datum, leestijd, bijschrift |
| `--lijn` | #e7dfd8 | randen en scheidingslijnen |
| `--groen` | #2f6b3a | PEIL, portemonnee, gecontroleerd |
| `--groenzacht` | #edf3ee | achtergrond van PEIL-melding |
| `--beeld` | #efe8e1 | plek waar nog geen beeld staat |

## letters en maten

- Naam in de kop: Source Serif 4, 700, 44px (telefoon 30px).
- Titel hoofdbericht: Source Serif 4, 600, 36px (telefoon 26px).
- Titel kaart: Source Serif 4, 600, 22px.
- Titel artikel: Source Serif 4, 600, 46px (telefoon 31px).
- Lopende tekst: Manrope 400, 16px; in een artikel 18px met regelafstand 1,75.
- Rubrieklabel: Manrope 700, 12px, hoofdletters, letterafstand 0,09em, maroon.
- Knoppen: pilvorm (afronding 999px). Kaarten: afronding 18px, hoofdbericht 20px, rand 1px `--lijn`, geen schaduw.
- Breedte inhoud: maximaal 1240px, zijmarge 40px (telefoon 18px). Leeskolom artikel maximaal 720px.
- Omslagpunt naar telefoonweergave: 720px.

## open keuken

Integriteit, actualiteit en kwaliteit zijn op elk scherm zichtbaar.

- Voorpagina: een regel onder de kop met het moment van bijwerken, het aantal berichten van vandaag, het aantal geraadpleegde bronnen en een link "Zo werken wij".
- Elke kaart: onderaan het aantal bronnen en "Gecontroleerd".
- Artikelpagina: een paneel "Open keuken" (geplaatst, bijgewerkt, gecontroleerd, correcties) en een paneel "Bronnen" met genummerde bronnen.
- Toon alleen echte gegevens. Is een getal of datum niet beschikbaar, laat de regel dan weg. Nooit een verzonnen aantal of een vast "gecontroleerd" zonder dat de controle heeft plaatsgevonden.

## onderdelen van de voorpagina, van boven naar beneden

1. Netwerkbalk.
2. Kop: naam, ondertitel "Frankrijk vandaag, voor Nederlanders en Belgen", links PEIL en Forum, knop Nieuwsbrief.
3. Regel open keuken.
4. Rubriekknoppen: Laatste nieuws, Algemeen, Politiek, Economie en ondernemen, Reizen en verkeer, Natuur en rampen, Toerisme, Merkwaardig, en apart in groen "Raakt uw portemonnee".
5. Hoofdbericht: beeld links, tekst rechts.
6. Kaarten in drie kolommen: beeld, rubriek, titel, datum en leestijd, samenvatting, eventueel PEIL-melding, bronnen en gecontroleerd.
7. Knop "Meer berichten" en voet.

## nog niet beslist

- De naam van de nieuwssite (in de schetsen staat "[Naam nieuwssite]").
- Welke namen in de netwerkbalk staan. In de schets: Infofrankrijk, Nieuws, Nederlanders.fr, Infopoche, Dossier Frankrijk, Café Claude, Nedergids.
- De getallen en de teksten tussen haken in de schetsen zijn voorbeeldtekst.
