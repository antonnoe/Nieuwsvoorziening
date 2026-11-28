// Eigen illustraties (Communities Abroad) als terugval achter Unsplash (besluit 28-11-2026).
// De lijst staat op één plek: public/illustraties/index.json. Faalt het lezen of is de lijst
// leeg, dan zijn er geen illustraties en geeft `kiesIllustratie` null: nooit een kapotte pagina.
// Keuze zonder modelaanroep: categorie, binding (nl of fr), trefwoorden, langst niet gebruikt.
import indexJson from "../../public/illustraties/index.json";
import type { BeeldCredit, Categorie } from "./types";
import { haalJson, type ModelClient } from "./ai";
import { modelGoedkoop } from "./config";

export interface Illustratie {
  id: string;
  categorie: string;
  naam: string;
  /** Subcategorie (bijv. steden, justitie), vooral voor AI-agents die het meest geschikte beeld zoeken. Optioneel. */
  groep?: string;
  /** Eén zin: wat staat erop en waar past het bij. Optioneel. */
  beschrijving?: string;
  binding: "fr" | "nl";
  trefwoorden: string[];
  svg: string;
  png: string;
}

export interface IllustratieLijst {
  afkomst: string;
  beelden: Illustratie[];
}

/** Maakt van onbekende invoer een geldige lijst; ongeldige beelden vallen af, bij een fout is de lijst leeg. */
export function leesIllustraties(ruw: unknown): IllustratieLijst {
  try {
    const r = ruw as { afkomst?: unknown; beelden?: unknown } | null;
    const lijst = Array.isArray(r?.beelden) ? (r!.beelden as unknown[]) : [];
    const beelden: Illustratie[] = [];
    for (const x of lijst) {
      const b = x as Partial<Illustratie> | null;
      if (!b || typeof b.id !== "string" || typeof b.categorie !== "string" || typeof b.naam !== "string" || typeof b.svg !== "string" || typeof b.png !== "string") continue;
      if (!b.svg.startsWith("/") || !b.png.startsWith("/")) continue;
      beelden.push({
        id: b.id, categorie: b.categorie, naam: b.naam,
        ...(typeof b.groep === "string" && b.groep ? { groep: b.groep } : {}),
        ...(typeof b.beschrijving === "string" && b.beschrijving ? { beschrijving: b.beschrijving } : {}),
        binding: b.binding === "nl" ? "nl" : "fr",
        trefwoorden: Array.isArray(b.trefwoorden) ? b.trefwoorden.filter((t): t is string => typeof t === "string") : [],
        svg: b.svg, png: b.png,
      });
    }
    return { afkomst: typeof r?.afkomst === "string" ? r.afkomst : "Illustratie door Communities Abroad", beelden };
  } catch {
    return { afkomst: "Illustratie door Communities Abroad", beelden: [] };
  }
}

export const ILLUSTRATIES: IllustratieLijst = leesIllustraties(indexJson);

/** Kleine letters, zonder accenten, voor het vergelijken van tekst en trefwoorden. */
export function normaal(t: string): string {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** True als kop of samenvatting over Nederlanders of Nederland gaat. */
export function gaatOverNederland(tekst: string): boolean {
  return /(^|[^a-z])(nederland|nederlander|nl([^a-z]|$))/.test(normaal(tekst));
}

function basisUrl(): string {
  return (process.env.NIEUWS_BASIS_URL || "https://nieuws.infofrankrijk.com").replace(/\/+$/, "");
}

/** Aantal nieuwste zichtbare berichten waarvan de illustratie bij een nieuwe keuze hard wordt uitgesloten (besluit 28-11-2026: geen dubbelen op de eerste pagina). */
export const HARDE_UITSLUITING = 13;

export const pad = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return String(u || "").split("?")[0];
  }
};

export interface IllustratieInvoer {
  kop: string;
  samenvatting: string;
  categorie: Categorie | string;
}

type Kandidaat = { i: Illustratie; s: number; eigen: number; bind: number; g: number };

/** Score per beeld en de volgorde-regels; gedeeld door `kiesIllustratie` en de kandidatenlijst voor het model. */
function maakKandidaten(b: IllustratieInvoer, recent: string[], lijst: IllustratieLijst, uitsluit?: string[]) {
  // Harde uitsluiting: de illustraties van de 13 nieuwste zichtbare berichten (`recent[0..12]`, of de expliciete lijst `uitsluit`).
  // Blijft er niets over (kleine set), dan vervalt de uitsluiting: liever een herhaling dan geen beeld.
  const uit = new Set((uitsluit ?? recent.slice(0, HARDE_UITSLUITING)).map(pad));
  const vrij = lijst.beelden.filter((i) => !uit.has(pad(i.svg)));
  const alle = vrij.length ? vrij : lijst.beelden;
  const tekst = `${b.kop || ""} ${b.samenvatting || ""}`;
  const voorkeur = gaatOverNederland(tekst) ? "nl" : "fr";
  const schoon = (t: string) => ` ${normaal(t).replace(/[^a-z0-9]+/g, " ")} `;
  const kopTekst = schoon(b.kop || "");
  const samTekst = schoon(b.samenvatting || "");
  // Trefwoord in de kop 2 punten, in de samenvatting 1; elk trefwoord telt hooguit één keer, met het hoogste gewicht.
  const score = (i: Illustratie) => {
    let s = 0;
    for (const t of i.trefwoorden) {
      const n = normaal(t).replace(/[^a-z0-9]+/g, " ").trim();
      if (!n) continue;
      if (kopTekst.includes(` ${n}`)) s += 2;
      else if (samTekst.includes(` ${n}`)) s += 1;
    }
    // Nederland-onderwerp: een nl-beeld met minstens 1 treffer krijgt +3 (voorrang, geen tiebreak).
    return voorkeur === "nl" && i.binding === "nl" && s > 0 ? s + 3 : s;
  };
  const gebruikPlek = new Map<string, number>(); // pad -> plaats in `recent` (0 = nieuwste)
  recent.forEach((u, n) => {
    const p = pad(u);
    if (!gebruikPlek.has(p)) gebruikPlek.set(p, n);
  });
  const geleden = (i: Illustratie) => gebruikPlek.get(pad(i.svg)) ?? Infinity;
  // Volgorde: hoogste score, eigen categorie, nl-voorrang (binding), langst niet gebruikt; daarna de vaste volgorde (eerste wint).
  const kandidaten: Kandidaat[] = alle.map((i) => ({ i, s: score(i), eigen: i.categorie === b.categorie ? 1 : 0, bind: i.binding === voorkeur ? 1 : 0, g: geleden(i) }));
  const beter = (x: Kandidaat, y: Kandidaat) =>
    x.s !== y.s ? x.s > y.s : x.eigen !== y.eigen ? x.eigen > y.eigen : x.bind !== y.bind ? x.bind > y.bind : x.g > y.g;
  const pak = (pool: Kandidaat[]) => pool.reduce<Kandidaat | null>((m, k) => (!m || beter(k, m) ? k : m), null);
  return { kandidaten, voorkeur, beter, pak };
}

/**
 * Kiest een illustratie (besluit 28-11-2026): trefwoord in de kop 2 punten, in de samenvatting 1 (per trefwoord hooguit één keer);
 * de hoogste score over de hele set wint; bij gelijke score de eigen categorie, dan binding nl bij Nederland-onderwerpen (anders fr),
 * dan het langst niet gebruikt (`recent` = beeld-urls, nieuwste eerst; nooit gebruikt telt als het langst geleden), dan de vaste volgorde.
 * Gaat het bericht over Nederland, dan krijgt een nl-beeld met minstens 1 treffer +3 punten; zijn alle scores 0, dan gaat een nl-beeld voor (eigen categorie eerst, anders de hele set).
 * Is de hoogste score 0, dan de keuze in de eigen categorie.
 */
export function kiesIllustratie(b: IllustratieInvoer, recent: string[] = [], lijst: IllustratieLijst = ILLUSTRATIES, uitsluit?: string[]): Illustratie | null {
  try {
    if (!lijst.beelden.length) return null;
    const { kandidaten, voorkeur, pak } = maakKandidaten(b, recent, lijst, uitsluit);
    const top = pak(kandidaten);
    if (top && top.s > 0) return top.i;
    // Alles 0: de bestaande keuze in de eigen categorie (heeft die geen beelden, dan de hele set).
    const eigenPool = kandidaten.filter((k) => k.eigen === 1);
    const nlEigen = voorkeur === "nl" ? eigenPool.filter((k) => k.bind === 1) : [];
    const nlAlle = voorkeur === "nl" ? kandidaten.filter((k) => k.bind === 1) : [];
    if (nlEigen.length) return pak(nlEigen)!.i;
    if (nlAlle.length) return pak(nlAlle)!.i;
    const metVoorkeur = (eigenPool.length ? eigenPool : kandidaten).filter((k) => k.bind === 1);
    return (pak(metVoorkeur.length ? metVoorkeur : eigenPool.length ? eigenPool : kandidaten) ?? top)?.i ?? null;
  } catch {
    return null;
  }
}

export const MAX_MODEL_KANDIDATEN = 12;

/**
 * Kandidaten voor de modelkeuze (besluit 28-11-2026): de 12 hoogste op trefwoordscore (inclusief Nederland-voorrang, score > 0);
 * zijn het er minder dan 12, dan aangevuld met beelden uit de eigen categorie van het bericht (zelfde volgorde-regels).
 */
export function modelKandidaten(b: IllustratieInvoer, recent: string[] = [], lijst: IllustratieLijst = ILLUSTRATIES, uitsluit?: string[]): Illustratie[] {
  try {
    if (!lijst.beelden.length) return [];
    const { kandidaten, beter } = maakKandidaten(b, recent, lijst, uitsluit);
    const gesorteerd = [...kandidaten].sort((x, y) => (beter(x, y) ? -1 : beter(y, x) ? 1 : 0));
    const uit = gesorteerd.filter((k) => k.s > 0).slice(0, MAX_MODEL_KANDIDATEN);
    if (uit.length < MAX_MODEL_KANDIDATEN) {
      for (const k of gesorteerd) {
        if (uit.length >= MAX_MODEL_KANDIDATEN) break;
        if (k.eigen === 1 && !uit.includes(k)) uit.push(k);
      }
    }
    return uit.map((k) => k.i);
  } catch {
    return [];
  }
}

const SYSTEEM_KEUZE = `Je kiest een illustratie bij een nieuwsbericht over Frankrijk. Je krijgt kop en samenvatting en een genummerde lijst met beelden (id, naam, beschrijving, binding).
Kies het beeld dat het onderwerp van het bericht het best verbeeldt, liefst letterlijk het onderwerp. Gaat het bericht over Nederlanders of Belgen, kies dan een beeld met binding nl als dat past. Een beeld dat een ander onderwerp suggereert (bijvoorbeeld een markt bij honger in Afrika) is fout: kies dan liever een neutraler beeld dat wel klopt.
Antwoord uitsluitend met JSON: {"id":"..."}`;

/**
 * Kiest een illustratie met het goedkope model uit de kandidaten (max 1 aanroep). Bij een modelfout, een ongeldig antwoord
 * (id niet in de lijst) of zonder client: de trefwoordkeuze. `keuze` zegt hoe het beeld gekozen is.
 */
export async function kiesIllustratieMetModel(
  b: IllustratieInvoer, client: ModelClient | null, recent: string[] = [], lijst: IllustratieLijst = ILLUSTRATIES, uitsluit?: string[],
): Promise<{ illustratie: Illustratie; keuze: "model" | "trefwoord" } | null> {
  const terugval = () => {
    const i = kiesIllustratie(b, recent, lijst, uitsluit);
    return i ? { illustratie: i, keuze: "trefwoord" as const } : null;
  };
  if (!client) return terugval();
  try {
    const kand = modelKandidaten(b, recent, lijst, uitsluit);
    if (!kand.length) return terugval();
    const regels = kand.map((i, n) => `${n + 1}. id: ${i.id} | naam: ${i.naam} | beschrijving: ${i.beschrijving || "-"} | binding: ${i.binding}`).join("\n");
    const antw = await client.tekst({
      model: modelGoedkoop(), maxTokens: 60, system: SYSTEEM_KEUZE,
      user: `Kop: ${b.kop}\nSamenvatting: ${b.samenvatting}\n\nBeelden:\n${regels}`,
    });
    const j = haalJson<{ id?: unknown }>(antw);
    const id = typeof j?.id === "string" ? j.id.trim() : "";
    const gekozen = id ? kand.find((i) => i.id === id) : undefined;
    return gekozen ? { illustratie: gekozen, keuze: "model" } : terugval();
  } catch {
    return terugval();
  }
}

/** Resultaat voor opslag: absolute SVG-url en bronvermelding met categorie, naam en PNG-url. Null zonder illustratie. */
export function illustratieResultaat(b: IllustratieInvoer, recent: string[] = [], lijst: IllustratieLijst = ILLUSTRATIES, uitsluit?: string[]): { url: string; credit: BeeldCredit } | null {
  const i = kiesIllustratie(b, recent, lijst, uitsluit);
  if (!i) return null;
  const basis = basisUrl();
  return {
    url: `${basis}${i.svg}`,
    credit: { bron: "Illustratie", maker: "Communities Abroad", categorie: i.categorie, naam: i.naam, png: `${basis}${i.png}`, keuze: "trefwoord" },
  };
}

/** Als `illustratieResultaat`, maar met de modelkeuze (`kiesIllustratieMetModel`); `credit.keuze` is "model" of "trefwoord". */
export async function illustratieResultaatMetModel(b: IllustratieInvoer, client: ModelClient | null, recent: string[] = [], lijst: IllustratieLijst = ILLUSTRATIES, uitsluit?: string[]): Promise<{ url: string; credit: BeeldCredit } | null> {
  const k = await kiesIllustratieMetModel(b, client, recent, lijst, uitsluit);
  if (!k) return null;
  const i = k.illustratie;
  const basis = basisUrl();
  return {
    url: `${basis}${i.svg}`,
    credit: { bron: "Illustratie", maker: "Communities Abroad", categorie: i.categorie, naam: i.naam, png: `${basis}${i.png}`, keuze: k.keuze },
  };
}

/** Het resultaat voor een beeld dat de redactie uit de beeldbank koos: `keuze` is "redactie" en blijft dus buiten de automatische herkeuze (stap 6b). */
export function illustratieKeuzeRedactie(i: Illustratie): { url: string; credit: BeeldCredit } {
  const basis = basisUrl();
  return { url: `${basis}${i.svg}`, credit: { bron: "Illustratie", maker: "Communities Abroad", categorie: i.categorie, naam: i.naam, png: `${basis}${i.png}`, keuze: "redactie" } };
}

/** Zoekt een beeld uit de beeldbank op id (voor de redactie); null als het niet bestaat. */
export function illustratieMetId(id: string, lijst: IllustratieLijst = ILLUSTRATIES): Illustratie | null {
  return lijst.beelden.find((i) => i.id === id) ?? null;
}

/**
 * Dubbelen op de eerste pagina: `berichten` zijn de nieuwste zichtbare berichten (nieuwste eerst). Geeft per beeld dat al bij een
 * nieuwer bericht staat het oudere bericht terug, tenzij dat een handmatige keuze heeft (redactie of getekend); dan het nieuwere,
 * tenzij dat ook handmatig is. Alleen eigen illustraties (Unsplash-foto's worden elders ontdubbeld).
 */
export function dubbeleBeelden<T extends { id: string; beeldUrl: string | null; beeldCredit?: BeeldCredit | null }>(berichten: T[]): T[] {
  const handmatig = (b: T) => b.beeldCredit?.keuze === "redactie" || b.beeldCredit?.keuze === "getekend";
  const eerste = new Map<string, T>();
  const uit: T[] = [];
  for (const b of berichten) {
    if (!b.beeldUrl || b.beeldCredit?.bron !== "Illustratie") continue;
    const p = pad(b.beeldUrl);
    const voor = eerste.get(p);
    if (!voor) { eerste.set(p, b); continue; }
    const kies = !handmatig(b) ? b : !handmatig(voor) ? voor : null;
    if (kies && !uit.includes(kies)) uit.push(kies);
  }
  return uit;
}
