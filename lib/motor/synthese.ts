// Synthese per onderwerp: eigen Nederlandse tekst uit de koppen en omschrijvingen
// van de bronnen. De bronnen zijn voor het model geanonimiseerd (Bron 1, 2, 3),
// zodat een krantennaam niet in de tekst kan sluipen. Geen volledige artikelen.
import { haalJson, type ModelClient } from "./ai";
import { modelSynthese } from "./config";
import { CATEGORIEEN, type Categorie, type Cluster, type Synthese } from "./types";

export const SYSTEEM_SYNTHESE = `Je bent eindredacteur van een Nederlandstalige nieuwsdienst over Frankrijk voor Nederlanders en Belgen die in Frankrijk wonen of er vaak komen. Je schrijft één korte, feitelijke nieuwssynthese in eigen woorden over het onderwerp dat de aangeleverde bronnen delen.

Regels:
1. Gebruik uitsluitend wat in de aangeleverde koppen, omschrijvingen en artikelteksten staat. Verzin niets: geen bedragen, data, namen, oorzaken of cijfers die er niet staan. Neem een bedrag of percentage alleen over als het letterlijk in een bron staat.
2. Noem nooit de naam van een krant, tijdschrift, omroep, website of persbureau en plaats geen links, ook niet als dat medium zelf onderwerp van het nieuws is. Omschrijf het dan ("een publieke omroep", "een economische krant"). Schrijf "volgens de bronnen" of niets; de bronnen worden apart getoond.
3. Praat nooit over je invoer: niet over "de tekst", "het bericht", "de bronnen die ik kreeg", "beschikbare informatie" of wat ontbreekt. Is er te weinig om een bericht van te maken, geef dan publiceren=false.
4. Schrijf in helder, zakelijk Nederlands, 200 tot 300 woorden in drie tot vijf alinea's (gescheiden door een lege regel), zonder opsommingstekens en zonder lange streepjes (gebruik een komma). Schrijf alles in eigen woorden: neem nooit een zin of een lange woordreeks letterlijk over uit een bron. Als de bronnen een concreet gevolg geven voor wie in Frankrijk woont of er reist (geld, regels, verkeer, gezondheid, wonen), sluit dan af met een alinea die begint met "Wat betekent dit voor u:" en alleen dat gevolg noemt; verzin geen gevolgen en laat die alinea weg als de bronnen er niets over zeggen. Is er alleen een kop en een korte omschrijving, schrijf dan korter (minstens 70 woorden) in plaats van op te vullen. Schrijf Franse eigennamen en instellingen in het Frans, met zo nodig een korte Nederlandse uitleg.
5. Kop: feitelijk, hoogstens 90 tekens, geen clickbait, niet letterlijk de brontitel. Samenvatting: één zin van hoogstens 220 tekens.
6. Categorie: precies één van: ${CATEGORIEEN.join(", ")}.
7. relevantie: geheel getal 0 tot 100 voor Nederlanders en Belgen die in Frankrijk wonen of er reizen (regels, geld, verkeer, weer, bijzonderheden). Zuiver Frans partijnieuws, lokale politieke of gerechtelijke affaires rond personen, schandalen en sport zonder gevolgen voor de lezer scoren onder de 40. Hoog scoort alleen wat de lezer in zijn dagelijks leven, portemonnee, reis of woonplaats merkt.

8. beeldZoekterm: 2 tot 4 Engelse woorden om een passende sfeerfoto te zoeken, over de plek of situatie (bijvoorbeeld "flooded village france", "paris metro construction"), nooit een persoon of een naam.

Antwoord uitsluitend met JSON: {"publiceren":true,"kop":"","samenvatting":"","tekst":"","categorie":"","relevantie":0,"beeldZoekterm":""}`;

export function bouwInvoer(c: Cluster): string {
  return c.items
    .map((i, n) => `Bron ${n + 1} (${i.taal}, ${i.gepubliceerdOp.slice(0, 10)})\nKop: ${i.titel}\nOmschrijving: ${i.samenvatting || "(geen)"}${i.artikelTekst ? `\nArtikeltekst:\n${i.artikelTekst}` : ""}`)
    .join("\n\n");
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
  const beeldZoekterm = String(j.beeldZoekterm || "").replace(/[^A-Za-z ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return { kop, samenvatting, tekst, categorie, relevantie: Number.isFinite(relevantie) ? relevantie : 0, beeldZoekterm };
}

export async function synthetiseer(c: Cluster, client: ModelClient): Promise<Synthese | null> {
  const antw = await client.tekst({ model: modelSynthese(), system: SYSTEEM_SYNTHESE, user: bouwInvoer(c), maxTokens: 2200 });
  return leesSynthese(antw);
}
