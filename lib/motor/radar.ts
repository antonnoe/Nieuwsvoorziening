// Radar (besluit opdrachtgever 28-11-2026, keuze A). HARDE REGEL: The Connexion is UITSLUITEND een onderwerpsignaal.
// Het wordt nooit als bron gebruikt: niet in bronnen, bronnenblok, nv_bron_items, clustering, synthese-invoer,
// artikelophaling, beeld of enige publicatie. Geen tekst, structuur, citaten of beeld wordt overgenomen of vertaald.
//
// Van de nieuws-sitemap (die in hun robots.txt staat) lezen we per url alleen: loc, news:publication_date en news:title.
// De artikelpagina's worden NIET opgehaald. Hooguit één aanvraag per run, timeout 10 s, faalt netjes.
// Het model krijgt alleen titels (nooit artikeltekst). Een signaal wordt gekoppeld aan een Franse overheidsbron uit onze
// eigen opslag (nv_bron_items); nooit een verzonnen url. Wat hier uitkomt is alleen zichtbaar voor de redactie
// (GET/POST /api/redactie); publieke API's, RSS en pagina's tonen niets van de radar.
import { haalJson, type ModelClient } from "./ai";
import { modelGoedkoop } from "./config";
import { normaliseer } from "./tekst";
import type { BronItem, RadarBron, RadarCategorie, RadarNieuw, RadarStatus } from "./types";
import { RADAR_CATEGORIEEN } from "./types";
import type { Opslag, OpgeslagenBericht } from "./opslag";

export const RADAR_SITEMAP_URL = "https://www.connexionfrance.com/tag/news?lab_viewport=newssitemap";
export const RADAR_VENSTER_DAGEN = 3;
export const RADAR_BRONNEN_DAGEN = 14;
export const RADAR_BEWAAR_DAGEN = 30;
export const RADAR_TIMEOUT_MS = 10_000;
export const RADAR_BATCH = 20;
export const RADAR_MAX_SELECTIE_AANROEPEN = 3;
export const RADAR_MAX_BEVESTIG_AANROEPEN = 10;
/** Tijdbudget voor de hele radarstap; daarna stopt ze netjes (de rest komt in de volgende run). */
export const RADAR_BUDGET_MS = 90_000;
export const GEEN_BRON_TEKST = "Primaire bron niet beschikbaar — handmatige controle vereist";
export const SIGNAAL_BRON_NAAM = "The Connexion";

// ---- 1. Sitemap lezen ----------------------------------------------------------------------------------

export interface SitemapItem {
  url: string;
  datum: string; // ISO
  titel: string;
}

const NAMEN: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026" };
const ontkoppel = (t: string) =>
  t.replace(/&(?:#(\d{1,7})|#x([\da-f]{1,6})|([a-z]{2,8}));/gi, (m, d, h, n) => {
    try {
      if (d) return String.fromCodePoint(Number(d));
      if (h) return String.fromCodePoint(Number.parseInt(h, 16));
      return NAMEN[String(n).toLowerCase()] ?? m;
    } catch {
      return m;
    }
  });
/** CDATA uitpakken en HTML-entiteiten decoderen (een tweede ronde voor dubbel gecodeerde titels); er worden geen tags weggehaald. */
function dekode(t: string): string {
  let s = String(t || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = ontkoppel(s);
  if (/&(?:#\d+|#x[\da-f]+|amp|lt|gt|quot|apos);/i.test(s)) s = ontkoppel(s);
  return s.replace(/\s+/g, " ").trim();
}

/** Leest alleen loc, news:publication_date en news:title per <url>. Items zonder alle drie vallen af. */
export function parseSitemap(xml: string): SitemapItem[] {
  const uit: SitemapItem[] = [];
  const blokken = String(xml || "").match(/<url\b[^>]*>[\s\S]*?<\/url>/gi) || [];
  for (const b of blokken) {
    const veld = (naam: string) => {
      const m = b.match(new RegExp(`<${naam}\\b[^>]*>([\\s\\S]*?)</${naam}>`, "i"));
      return m ? dekode(m[1]) : "";
    };
    const url = veld("loc");
    const datumRuw = veld("news:publication_date");
    const titel = veld("news:title");
    const t = Date.parse(datumRuw);
    if (!/^https?:\/\//i.test(url) || !titel || !Number.isFinite(t)) continue;
    uit.push({ url, datum: new Date(t).toISOString(), titel });
  }
  return uit;
}

/** Eén aanvraag, timeout 10 s; faalt netjes (geeft een foutmelding in plaats van te gooien). */
export async function leesSitemap(fetchFn: typeof fetch = fetch): Promise<{ items: SitemapItem[]; fout?: string }> {
  try {
    const r = await fetchFn(RADAR_SITEMAP_URL, {
      signal: AbortSignal.timeout(RADAR_TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; Nieuwsvoorziening/1.0; +https://nieuws.infofrankrijk.com/werkwijze)", accept: "application/xml,text/xml" },
    });
    if (!r.ok) return { items: [], fout: `HTTP ${r.status}` };
    return { items: parseSitemap(await r.text()) };
  } catch (e) {
    return { items: [], fout: (e instanceof Error ? e.message : String(e)).slice(0, 160) };
  }
}

// ---- 2. Filter -------------------------------------------------------------------------------------------

/**
 * Uitsluitlijst (op titel, hoofdletterongevoelig). Reguliere expressies; \b is een woordgrens.
 * Eerst de onderwerpen die de doelgroep (EU-burgers, huiseigenaren, verhuurders, gepensioneerden) niet raken,
 * dan pure human-interest, opinie, lifestyle, sport, recepten en reistips.
 */
export const RADAR_UITSLUIT: { reden: string; patroon: RegExp }[] = [
  { reden: "brexit", patroon: /\bbrexit\b|\bpost-brexit\b|withdrawal agreement/i },
  { reden: "uk/brits", patroon: /\bUK\b|\bU\.K\.|\bbrit(?:ish|ons?|s|ain)\b|\bengland\b|\benglish\b|\bscot(?:land|tish)\b|\bwelsh\b|\banglo-/i },
  { reden: "visa voor niet-eu", patroon: /\bvisas?\b|\bnon-eu\b|\bthird[- ]country\b/i },
  { reden: "verblijfskaart voor britten", patroon: /carte de s[ée]jour|titre de s[ée]jour|residen(?:cy|ce) (?:card|permit|rules)/i },
  { reden: "90/180-dagenregel", patroon: /\b90\s*(?:\/|-|days? (?:in|out of))\s*180\b|\b90-day rule\b|\b180-day\b/i },
  { reden: "ees/etias", patroon: /\bEES\b|\bETIAS\b|entry[/ -]exit system|travel authori[sz]ation/i },
  { reden: "britse rijbewijzen", patroon: /driving licen[cs]e|permis de conduire britannique/i },
  { reden: "uk-pensioenen", patroon: /state pension|\bWASPI\b|\bS1 form\b|\bSERPS\b/i },
  { reden: "brits-franse verdragen", patroon: /le touquet|\btreaty\b.*\b(?:france|uk|britain)\b|\b(?:france|uk|britain)\b.*\btreaty\b|channel (?:crossing|tunnel deal)|small boats?/i },
  { reden: "human interest/opinie", patroon: /\bopinion\b|\bcolumn\b|\beditorial\b|\bletters?\b|\bobituary\b|\bin memoriam\b|\bmy (?:life|story)\b|\bmeet the\b|\bheart-?warming\b|\bviral\b|\bcelebrity\b|\bcouple (?:who|from)\b/i },
  { reden: "lifestyle/recept/reizen", patroon: /\brecipes?\b|\bcooking\b|\bwines?\b|\bvineyards?\b|\blifestyle\b|\bhow to make\b|\bbest (?:places|villages|beaches|restaurants)\b|\bthings to do\b|\btravel tips?\b|\bweekend (?:in|break)\b|\bholiday (?:ideas|tips)\b|\bhoroscope\b|\bfashion\b/i },
  { reden: "sport", patroon: /\brugby\b|\bfootball\b|\bsoccer\b|\bligue 1\b|\btour de france\b|\bcycling\b|\btennis\b|\broland[- ]garros\b|\bolympics?\b|\bparalympics?\b|\bformula (?:1|one)\b|\bgolf\b|\bmarathon\b|\bhandball\b|\bbasketball\b|\bsailing race\b/i },
];

/** Geeft de reden van uitsluiting, of null als de titel door het filter komt. */
export function uitgesloten(titel: string): string | null {
  for (const u of RADAR_UITSLUIT) if (u.patroon.test(titel)) return u.reden;
  return null;
}

/** Alleen items van de laatste `dagen` dagen, niet in de toekomst, nieuwste eerst, ontdubbeld op url. */
export function binnenVenster(items: SitemapItem[], nu: number, dagen = RADAR_VENSTER_DAGEN): SitemapItem[] {
  const gezien = new Set<string>();
  return items
    .filter((i) => {
      const t = Date.parse(i.datum);
      return nu - t <= dagen * 86400_000 && t <= nu + 3600_000 && (gezien.has(i.url) ? false : (gezien.add(i.url), true));
    })
    .sort((a, b) => b.datum.localeCompare(a.datum));
}

// ---- 3. Selectie op praktisch belang (goedkoop model, alleen titels) -------------------------------------

export interface Geselecteerd {
  item: SitemapItem;
  werktitel: string;
  categorie: RadarCategorie;
  relevantie: string;
  zoektermen: string[];
}

export const SYSTEEM_RADAR_SELECTIE = `Je bent redacteur van een Nederlandstalige nieuwsdienst voor Nederlanders en Belgen die in Frankrijk wonen: EU-burgers, huiseigenaren, verhuurders, bezitters van een tweede huis en gepensioneerden. Je krijgt een genummerde lijst met titels van berichten en beoordeelt ALLEEN op de titel of een titel praktisch impactnieuws is: een nieuwe of gewijzigde regel, tarief, belasting, premie, subsidie, verplichting, verbod, prijs of procedure die deze lezers concreet raakt. Geen human interest, opinie, lifestyle, sport, recepten, reistips of nieuws dat alleen Britten of niet-EU-burgers raakt.
Categorieën (precies een van): Vastgoed, Belastingen, Zorg, Verkeer, Energie, Consumentenrecht, Overig.
Geef voor elke GESELECTEERDE titel een object en laat alle andere weg:
{"n": <nummer>, "werktitel": "korte feitelijke Nederlandse titel in je eigen woorden, geen vertaling van de kop, geen onnodige hoofdletters, geen krantennaam", "categorie": "...", "relevantie": "een of twee zinnen: waarom dit Nederlanders en Belgen in Frankrijk raakt", "zoektermen": ["3 tot 6 Franse zoektermen of korte zinnen waarmee je de bijbehorende Franse overheidsmaatregel zou vinden, bijvoorbeeld de naam van de regeling of belasting"]}
Antwoord uitsluitend met een JSON-lijst van die objecten (een lege lijst [] als niets past). Verzin geen feiten die niet in de titel staan.`;

/** Valideert het modelantwoord; onbruikbare objecten vallen af. */
export function leesSelectie(antwoord: string, batch: SitemapItem[]): Geselecteerd[] {
  const lijst = haalJson<unknown>(antwoord);
  if (!Array.isArray(lijst)) return [];
  const uit: Geselecteerd[] = [];
  const gezien = new Set<number>();
  for (const x of lijst) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const n = Number(o.n);
    if (!Number.isInteger(n) || n < 1 || n > batch.length || gezien.has(n)) continue;
    const werktitel = typeof o.werktitel === "string" ? o.werktitel.replace(/\s+/g, " ").trim() : "";
    const relevantie = typeof o.relevantie === "string" ? o.relevantie.replace(/\s+/g, " ").trim() : "";
    const zoektermen = (Array.isArray(o.zoektermen) ? o.zoektermen : [])
      .filter((z): z is string => typeof z === "string" && z.trim().length >= 3)
      .map((z) => z.trim().slice(0, 80))
      .slice(0, 6);
    if (werktitel.length < 8 || werktitel.length > 160 || !relevantie || !zoektermen.length) continue;
    // De signaalbron mag nergens in de tekst voorkomen; de redactie ziet haar alleen in het veld signaalVan.
    if (/connexion/i.test(`${werktitel} ${relevantie}`)) continue;
    const categorie = (RADAR_CATEGORIEEN as readonly string[]).includes(String(o.categorie)) ? (o.categorie as RadarCategorie) : "Overig";
    gezien.add(n);
    uit.push({ item: batch[n - 1], werktitel, categorie, relevantie: relevantie.slice(0, 400), zoektermen });
  }
  return uit;
}

// ---- 4. Bronkoppeling: Franse overheid in onze eigen opslag -----------------------------------------------

/** Publieke instellingen buiten .gouv.fr die als primaire bron gelden. */
export const OVERHEID_DOMEINEN = [
  "service-public.fr", "vie-publique.fr", "insee.fr", "ameli.fr", "urssaf.fr", "caf.fr", "lassuranceretraite.fr", "info-retraite.fr",
  "francetravail.fr", "banque-france.fr", "assemblee-nationale.fr", "senat.fr", "conseil-constitutionnel.fr", "conseil-etat.fr",
  "legifrance.gouv.fr", "boss.gouv.fr", "ants.gouv.fr", "msa.fr", "cnav.fr",
];

/** Is dit een .gouv.fr-adres of een publieke instelling uit de lijst? (nooit de signaalbron) */
export function isOverheidsUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (h.includes("connexionfrance")) return false;
    return h === "gouv.fr" || h.endsWith(".gouv.fr") || OVERHEID_DOMEINEN.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Alleen echte overheidsitems uit de eigen opslag: regime overheid én een toegestaan domein. */
export const overheidKandidaten = (items: BronItem[]): BronItem[] => items.filter((i) => i.regime === "overheid" && isOverheidsUrl(i.url));

const zonder = (t: string) => normaliseer(t).replace(/[^a-z0-9]+/g, " ").trim();

/** Aantal zoektermen dat in de tekst voorkomt (term als hele zin, of alle woorden van de term van 4+ letters). */
export function termTreffers(zoektermen: string[], tekst: string): number {
  const h = ` ${zonder(tekst)} `;
  let n = 0;
  for (const z of zoektermen) {
    const t = zonder(z);
    if (!t) continue;
    if (h.includes(` ${t} `)) { n += 1; continue; }
    const w = t.split(" ").filter((x) => x.length >= 4);
    if (w.length >= 2 && w.every((x) => h.includes(` ${x}`))) n += 1;
    else if (w.length === 1 && t.split(" ").length === 1 && h.includes(` ${w[0]}`)) n += 1;
  }
  return n;
}

const drempelTreffers = (zoektermen: string[]) => Math.max(2, Math.ceil(zoektermen.length * 0.5));

/** Top `max` overheidsitems op trefwoordoverlap (minstens de drempel), beste eerst, bij gelijk nieuwste eerst. */
export function zoekOverheidsItems(zoektermen: string[], kandidaten: BronItem[], max = 5): BronItem[] {
  const drempel = drempelTreffers(zoektermen);
  return kandidaten
    .map((i) => ({ i, n: termTreffers(zoektermen, `${i.titel} ${i.samenvatting}`) }))
    .filter((x) => x.n >= drempel)
    .sort((a, b) => b.n - a.n || b.i.gepubliceerdOp.localeCompare(a.i.gepubliceerdOp))
    .slice(0, max)
    .map((x) => x.i);
}

/** Bestaat het onderwerp al als gepubliceerd bericht? Trefwoordoverlap op kop en samenvatting; geeft het eerste bericht. */
export function zoekBestaandBericht(zoektermen: string[], berichten: Pick<OpgeslagenBericht, "id" | "kop" | "samenvatting" | "status" | "redactie">[]): string | null {
  const drempel = drempelTreffers(zoektermen);
  let beste: { id: string; n: number } | null = null;
  for (const b of berichten) {
    if (b.status !== "gepubliceerd" || b.redactie === "weg") continue;
    const n = termTreffers(zoektermen, `${b.kop} ${b.samenvatting}`);
    if (n >= drempel && (!beste || n > beste.n)) beste = { id: b.id, n };
  }
  return beste?.id ?? null;
}

export const SYSTEEM_RADAR_BEVESTIG = `Je controleert of Franse overheidsberichten over DEZELFDE maatregel gaan als een onderwerp. Je krijgt een onderwerp (een korte Nederlandse omschrijving) en genummerde kandidaten (kop en omschrijving van een overheidsbron). Kies alleen de kandidaten die over precies dezelfde maatregel of regeling gaan, niet over een verwant onderwerp. Bij twijfel kies je niets.
Antwoord uitsluitend met JSON: {"matches": [nummers]} (een lege lijst bij geen match of twijfel).`;

export function leesBevestiging(antwoord: string, aantal: number): number[] {
  const o = haalJson<{ matches?: unknown }>(antwoord);
  if (!o || !Array.isArray(o.matches)) return [];
  const uit = new Set<number>();
  for (const x of o.matches) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= aantal) uit.add(n);
  }
  return [...uit].sort((a, b) => a - b).slice(0, 3);
}

const datumDeel = (iso: string) => String(iso || "").slice(0, 10);

// ---- De radarstap -----------------------------------------------------------------------------------------

export interface RadarOpties {
  opslag: Opslag;
  client: ModelClient | null;
  fetchFn?: typeof fetch;
  nu?: number;
  budgetMs?: number;
}
export interface RadarUitslag {
  ok: boolean;
  /** Url's van overheidsitems die bij een signaal passen: de motor geeft die onderwerpen voorrang (alleen die overheidsbronnen). */
  voorrangUrls: string[];
  nieuw: number;
  detail: Record<string, unknown>;
  fout?: string;
}

/** De opslag zegt dat de tabel nv_radar ontbreekt. */
export class RadarOntbreekt extends Error {
  constructor() {
    super("De tabel nv_radar bestaat nog niet (migratie niet toegepast).");
    this.name = "RadarOntbreekt";
  }
}
/** Herkent de fout van Supabase bij een ontbrekende tabel nv_radar. */
export function isRadarFout(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /nv_radar/i.test(m) && /(42P01|42703|PGRST204|PGRST205|does not exist|Could not find)/i.test(m);
}

/**
 * De hele radar: sitemap lezen, filteren, selecteren, koppelen aan overheidsbronnen, opslaan.
 * Faalt nooit naar buiten: een ontbrekende tabel, sitemap of modelfout geeft ok met een detail of een foutmelding.
 */
export async function draaiRadar(o: RadarOpties): Promise<RadarUitslag> {
  const nu = o.nu ?? Date.now();
  const start = Date.now();
  const budget = o.budgetMs ?? RADAR_BUDGET_MS;
  const klaar = () => Date.now() - start >= budget;
  const uit: RadarUitslag = { ok: true, voorrangUrls: [], nieuw: 0, detail: {} };
  try {
    if (!o.client) return { ...uit, detail: { overgeslagen: "geen model (radar ongetest in deze run)" } };
    // Bekende signalen eerst: ontbreekt de tabel, dan stopt de radar hier en draait de motor gewoon door (geen aanvraag, geen modelkosten).
    let bekend: Set<string>;
    try {
      bekend = new Set(await o.opslag.radarBekend(new Date(nu - RADAR_BEWAAR_DAGEN * 86400_000).toISOString()));
    } catch (e) {
      if (e instanceof RadarOntbreekt || isRadarFout(e)) return { ...uit, detail: { overgeslagen: "tabel nv_radar ontbreekt (migratie nog niet toegepast)" } };
      throw e;
    }
    const sm = await leesSitemap(o.fetchFn ?? fetch);
    // Een storing aan de kant van de signaalbron is geen fout van de motor: de radar slaat deze ronde over (detail in de run).
    if (sm.fout) return { ...uit, detail: { sitemapFout: sm.fout } };
    const venster = binnenVenster(sm.items, nu);
    let uitgesloten_ = 0;
    const reden: Record<string, number> = {};
    const doorFilter = venster.filter((i) => {
      const r = uitgesloten(i.titel);
      if (r) { uitgesloten_ += 1; reden[r] = (reden[r] || 0) + 1; return false; }
      return true;
    });
    const nieuwe = doorFilter.filter((i) => !bekend.has(i.url));
    uit.detail = { gelezen: sm.items.length, binnenVenster: venster.length, uitgesloten: uitgesloten_, uitsluitRedenen: reden, alBekend: doorFilter.length - nieuwe.length };
    if (!nieuwe.length) return uit;

    // Selectie: per batch van hooguit 20 titels een aanroep, hooguit 3 aanroepen per run.
    const gekozen: Geselecteerd[] = [];
    let selectieAanroepen = 0;
    for (let i = 0; i < nieuwe.length && selectieAanroepen < RADAR_MAX_SELECTIE_AANROEPEN && !klaar(); i += RADAR_BATCH) {
      const batch = nieuwe.slice(i, i + RADAR_BATCH);
      selectieAanroepen += 1;
      try {
        const antw = await o.client.tekst({
          model: modelGoedkoop(), maxTokens: 2500, system: SYSTEEM_RADAR_SELECTIE,
          user: batch.map((b, k) => `${k + 1}. ${b.titel}`).join("\n"),
        });
        gekozen.push(...leesSelectie(antw, batch));
      } catch {
        /* modelfout: deze batch komt de volgende run opnieuw (niet opgeslagen) */
      }
    }
    uit.detail = { ...uit.detail, nieuwTeBeoordelen: nieuwe.length, selectieAanroepen, geselecteerd: gekozen.length };
    if (!gekozen.length) return uit;

    // Eigen opslag lezen: overheidsitems en recente berichten.
    const sindsBronnen = new Date(nu - RADAR_BRONNEN_DAGEN * 86400_000).toISOString();
    const [items, berichten] = await Promise.all([
      o.opslag.radarOverheidItems(sindsBronnen).catch(() => [] as BronItem[]),
      o.opslag.berichtenVoorRedactie(sindsBronnen, 500).catch(() => [] as OpgeslagenBericht[]),
    ]);
    const overheid = overheidKandidaten(items);

    const rijen: RadarNieuw[] = [];
    let bevestigAanroepen = 0, alGepubliceerd = 0, klaarVoorRedactie = 0, handmatig = 0;
    for (const g of gekozen) {
      const basis = { signaalUrl: g.item.url, signaalDatum: g.item.datum, werktitel: g.werktitel, categorie: g.categorie, relevantie: g.relevantie, beoordeeldOp: new Date(nu).toISOString() };
      const bestaand = zoekBestaandBericht(g.zoektermen, berichten);
      if (bestaand) {
        rijen.push({ ...basis, status: "al gepubliceerd", primaireBron: null, berichtId: bestaand });
        alGepubliceerd += 1;
        continue;
      }
      let bronnen: BronItem[] = [];
      const voorstel = zoekOverheidsItems(g.zoektermen, overheid, 5);
      if (voorstel.length && bevestigAanroepen < RADAR_MAX_BEVESTIG_AANROEPEN && !klaar()) {
        bevestigAanroepen += 1;
        try {
          const antw = await o.client.tekst({
            model: modelGoedkoop(), maxTokens: 200, system: SYSTEEM_RADAR_BEVESTIG,
            user: `Onderwerp: ${g.werktitel}\nFranse zoektermen: ${g.zoektermen.join("; ")}\n\nKandidaten:\n${voorstel.map((v, k) => `${k + 1}. ${v.titel}${v.samenvatting ? ` — ${v.samenvatting.slice(0, 300)}` : ""}`).join("\n")}`,
          });
          bronnen = leesBevestiging(antw, voorstel.length).map((n) => voorstel[n - 1]);
        } catch {
          bronnen = []; // bij een modelfout of twijfel geen match: handmatige broncheck
        }
      }
      if (bronnen.length) {
        const primair: RadarBron[] = bronnen.map((b) => ({ naam: b.bronNaam, url: b.url, datum: b.gepubliceerdOp }));
        rijen.push({ ...basis, status: "klaar voor redactie", primaireBron: primair, berichtId: null });
        uit.voorrangUrls.push(...bronnen.map((b) => b.url));
        klaarVoorRedactie += 1;
      } else {
        rijen.push({ ...basis, status: "handmatige broncheck vereist", primaireBron: null, berichtId: null });
        handmatig += 1;
      }
    }
    uit.nieuw = await o.opslag.radarOpslaan(rijen);
    uit.detail = { ...uit.detail, bevestigAanroepen, klaarVoorRedactie, handmatig, alGepubliceerd, bewaard: uit.nieuw };
    return uit;
  } catch (e) {
    if (e instanceof RadarOntbreekt || isRadarFout(e)) return { ...uit, detail: { overgeslagen: "tabel nv_radar ontbreekt (migratie nog niet toegepast)" } };
    return { ...uit, ok: false, fout: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}

/** De vorm voor de redactie in GET /api/redactie (veld "radar"): alleen daar komt de signaalbron voor, in één vaste zin. */
export function radarVorm(r: { id: string; werktitel: string; categorie: string; signaalDatum: string; relevantie: string; primaireBron: RadarBron[] | null; status: RadarStatus; berichtId: string | null }) {
  return {
    id: r.id,
    onderwerp: r.werktitel,
    categorie: r.categorie,
    signaalVan: `${SIGNAAL_BRON_NAAM} (${datumDeel(r.signaalDatum)}), uitsluitend gebruikt als onderwerpsignaal`,
    relevantie: r.relevantie,
    primaireBronnen: (r.primaireBron || []).map((b) => ({ naam: b.naam, url: b.url, datum: b.datum })),
    status: r.status,
    berichtId: r.berichtId,
    opmerking: r.status === "handmatige broncheck vereist" ? GEEN_BRON_TEKST : null,
  };
}
