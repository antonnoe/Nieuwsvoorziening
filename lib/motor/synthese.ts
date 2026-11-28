// Synthese per onderwerp: eigen Nederlandse tekst uit de koppen en omschrijvingen
// van de bronnen. De bronnen zijn voor het model geanonimiseerd (Bron 1, 2, 3),
// zodat een krantennaam niet in de tekst kan sluipen. Geen volledige artikelen.
import { schoneZoektermen } from "./beeld";
import { haalJson, type ModelClient } from "./ai";
import { modelSynthese } from "./config";
import { CATEGORIEEN, leesSignaal, type Categorie, type Cluster, type Synthese } from "./types";
import { DEFINITIE_SIGNAAL } from "./signaal";
import { namenVoorOpeningszin } from "./poort";
import { heeftNlBeBron } from "./kanttekening";

export const SYSTEEM_SYNTHESE = `Je bent eindredacteur van een Nederlandstalige nieuwsdienst over Frankrijk voor Nederlanders en Belgen die in Frankrijk wonen of er vaak komen. Je schrijft één korte, feitelijke nieuwssynthese in eigen woorden over het onderwerp dat de aangeleverde bronnen delen.

Regels:
1. Gebruik uitsluitend wat in de aangeleverde koppen, omschrijvingen en artikelteksten staat. Verzin niets: geen bedragen, data, namen, oorzaken of cijfers die er niet staan. Neem een bedrag of percentage alleen over als het letterlijk in een bron staat.
2. Noem nooit de naam van een krant, tijdschrift, omroep, website of persbureau en plaats geen links, ook niet als dat medium zelf onderwerp van het nieuws is. Omschrijf het dan ("een publieke omroep", "een economische krant"). In kop en samenvatting komt nooit een mediumnaam voor. Eén uitzondering voor de tekst: staat onder de bronnen een regel "Namen die u in de openingszin mag noemen", dan MAG (u hoeft niet) de tekst beginnen met precies één zin waarin alle genoemde namen samen staan, in de vorm "<Naam>, <Naam> en <Naam> melden dat ..." (komma's tussen de namen, "en" voor de laatste, gevolgd door de kern van het nieuws in eigen woorden). Gebruik alleen namen uit die regel, noem elke naam hooguit één keer, en noem nergens anders in de tekst een medium. Staat die regel er niet, noem dan nooit een naam. Schrijf nooit "volgens de bronnen" of iets vergelijkbaars; de bronnen worden apart getoond.
3. Praat nooit over je invoer: niet over "de tekst", "het bericht", "de bronnen die ik kreeg", "beschikbare informatie" of wat ontbreekt. Is er te weinig om een bericht van te maken, geef dan publiceren=false.
4. Schrijf in helder, zakelijk Nederlands, 200 tot 300 woorden in drie tot vijf alinea's (gescheiden door een lege regel), zonder opsommingstekens en zonder lange streepjes (gebruik een komma). Schrijf alles in eigen woorden: neem nooit een zin of een lange woordreeks letterlijk over uit een bron. Als de bronnen een concreet gevolg geven voor wie in Frankrijk woont of er reist (geld, regels, verkeer, gezondheid, wonen), sluit dan af met een alinea die begint met "Wat betekent dit voor u:" en alleen dat gevolg noemt; verzin geen gevolgen en laat die alinea weg als de bronnen er niets over zeggen. Is er alleen een kop en een korte omschrijving, schrijf dan korter (minstens 70 woorden) in plaats van op te vullen. Schrijf Franse eigennamen en instellingen in het Frans, met zo nodig een korte Nederlandse uitleg. Kop en samenvatting zijn volledig Nederlands: geen Franse woorden of citaten (dus niet "très compromise" of "zones industrielles à fort potentiel", maar de Nederlandse omschrijving). In de tekst komt een Franse term alleen voor ná de Nederlandse omschrijving en hooguit één keer. Leg afkortingen en Franse politieke begrippen uit in gewoon Nederlands (artikel 49.3 is de regeling waarmee de regering een wet doorzet zonder stemming; schrijf partijafkortingen voluit). Een tekst van meer dan 120 woorden heeft minstens twee alinea's, gescheiden door een lege regel.
5. Kop: feitelijk, hoogstens 90 tekens, geen clickbait, niet letterlijk de brontitel. Samenvatting: één zin van hoogstens 220 tekens.
6. Categorie: precies één van: ${CATEGORIEEN.join(", ")}.
7. relevantie: geheel getal 0 tot 100 voor Nederlanders en Belgen die in Frankrijk wonen of er reizen (regels, geld, verkeer, weer, bijzonderheden). Zuiver Frans partijnieuws, lokale politieke of gerechtelijke affaires rond personen, schandalen en sport zonder gevolgen voor de lezer scoren onder de 40. Landelijke politiek, industriebeleid, beursnieuws en nieuws dat alleen de regio Parijs raakt scoren onder de 50, tenzij er een concreet gevolg is voor Nederlanders en Belgen die in Frankrijk wonen of er reizen. Tijdloze uitleg zonder nieuwsfeit (bijvoorbeeld "partners kunnen samen aansprakelijk zijn voor belasting") krijgt publiceren=false. Hoog scoort alleen wat de lezer in zijn dagelijks leven, portemonnee, reis of woonplaats merkt.

8. beeldZoektermen: een lijst van 3 Engelse zoektermen van 2 tot 4 woorden om een foto te zoeken die zichtbaar bij het onderwerp past, van specifiek naar algemeen. Zoek het onderwerp zelf, letterlijk en concreet, niet de streek of een beroemde plek: bij overstromingen "flooded street" en dan "heavy rain river", bij een vliegtuigfabriek "airplane factory", bij brandstofprijzen "fuel pump prices", bij een staking "empty train station". Nooit een persoon, naam, politicus of herkenbaar gebouw van een andere plaats.

9. portemonnee: true alleen bij een concreet financieel gevolg voor de lezer (prijzen, belasting, uitkering, premies, kosten); anders false.

10. signaal: ${DEFINITIE_SIGNAAL}

Antwoord uitsluitend met JSON: {"publiceren":true,"kop":"","samenvatting":"","tekst":"","categorie":"","relevantie":0,"portemonnee":false,"signaal":null,"beeldZoektermen":["","",""]}`;

/**
 * NL/BE-kijk (28-11-2026): alleen in de opdracht als het cluster een Nederlandse of Belgische bron heeft. Het model MAG (hoeft niet) een korte
 * alinea toevoegen die begint met "In Nederland", "In België" of "In Nederland en België" en alleen noemt wat die bronnen anders benadrukken of
 * wat het besluit daar betekent. Nooit een eigen mening; staat er niets wezenlijk anders, dan geen alinea.
 */
export const REGEL_NL_BE = `11. Onder de bronnen staan ook Nederlandse of Belgische bronnen (herkenbaar aan "Nederlandse bron" of "Belgische bron"). Staat daar iets wezenlijks anders in dan in de Franse bronnen, of zegt het wat het besluit voor Nederland of België betekent, dan MAG je (je hoeft niet) één korte alinea toevoegen die begint met "In Nederland", "In België" of "In Nederland en België" en alleen benoemt wat die Nederlandse of Belgische bronnen anders benadrukken of wat het besluit daar betekent. Gebruik alleen wat in die bronnen staat, nooit een eigen mening of eigen duiding, en schrijf niet "volgens de bronnen" of een krantennaam. Bedragen in die alinea moeten letterlijk in een bron staan. Staat er niets wezenlijk anders, schrijf dan geen alinea over Nederland of België. De alinea telt mee in de lengte en komt vóór een eventuele slotalinea "Wat betekent dit voor u:".`;

/** De systeemopdracht voor dit cluster: de vaste opdracht, met de NL/BE-regel alleen als er een Nederlandse of Belgische bron is. */
export function systeemSynthese(c: Cluster | null | undefined): string {
  if (!heeftNlBeBron(c)) return SYSTEEM_SYNTHESE;
  return SYSTEEM_SYNTHESE.replace("\n\nAntwoord uitsluitend met JSON:", `\n\n${REGEL_NL_BE}\n\nAntwoord uitsluitend met JSON:`);
}

export function bouwInvoer(c: Cluster): string {
  return c.items
    .map((i, n) => `Bron ${n + 1} (${[i.taal, i.gepubliceerdOp.slice(0, 10), i.land === "NL" ? "Nederlandse bron" : i.land === "BE" ? "Belgische bron" : ""].filter(Boolean).join(", ")})\nKop: ${i.titel}\nOmschrijving: ${i.samenvatting || "(geen)"}${i.artikelTekst ? `\nArtikeltekst:\n${i.artikelTekst}` : ""}`)
    .join("\n\n");
}

/** De regel met de echte namen van de persbronnen (alleen bij twee of meer verschillende media); de bronnen zelf blijven geanonimiseerd. */
export function namenRegel(c: Cluster): string {
  const namen = namenVoorOpeningszin(c);
  return namen.length >= 2 ? `\n\nNamen die u in de openingszin mag noemen: ${namen.join(", ")}` : "";
}

export function leesSynthese(ruw: string): Synthese | null {
  const j = haalJson<Record<string, unknown>>(ruw);
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  if (j.publiceren === false) return null;
  const kop = String(j.kop || "").trim();
  const samenvatting = String(j.samenvatting || "").trim();
  const tekst = String(j.tekst || "").trim();
  const cat = String(j.categorie || "").trim().toLowerCase() as Categorie;
  if (!kop || !tekst) return null;
  const categorie = (CATEGORIEEN as readonly string[]).includes(cat) ? cat : "algemeen";
  const relevantie = Math.max(0, Math.min(100, Math.round(Number(j.relevantie))));
  const beeldZoektermen = schoneZoektermen(Array.isArray(j.beeldZoektermen) ? j.beeldZoektermen : [j.beeldZoekterm]);
  return { kop, samenvatting, tekst, categorie, relevantie: Number.isFinite(relevantie) ? relevantie : 0, portemonnee: j.portemonnee === true || String(j.portemonnee).toLowerCase() === "true", signaal: leesSignaal(j.signaal), beeldZoekterm: beeldZoektermen[0] || "", beeldZoektermen };
}

/**
 * `onderwerp` (alleen voor een bericht dat de redactie bij een tip maakt) is een korte werktitel als aanwijzing waar het bericht over gaat.
 * Het is nadrukkelijk geen bron: het model mag er niets uit overnemen dat niet in de bronnen staat.
 */
export const ONDERWERP_AANWIJZING = "Onderwerp van het bericht (alleen een aanwijzing waar het over gaat, geen bron: neem er niets uit over dat niet in de bronnen hierboven staat en noem het niet)";

export async function synthetiseer(c: Cluster, client: ModelClient, onderwerp?: string): Promise<Synthese | null> {
  const aanwijzing = onderwerp && onderwerp.trim() ? `\n\n${ONDERWERP_AANWIJZING}: ${onderwerp.trim().slice(0, 200)}` : "";
  const antw = await client.tekst({ model: modelSynthese(), system: systeemSynthese(c), user: `${bouwInvoer(c)}${namenRegel(c)}${aanwijzing}`, maxTokens: 2200 });
  return leesSynthese(antw);
}
