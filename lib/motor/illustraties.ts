// Eigen illustraties (Communities Abroad) als terugval achter Unsplash (besluit 28-11-2026).
// De lijst staat op één plek: public/illustraties/index.json. Faalt het lezen of is de lijst
// leeg, dan zijn er geen illustraties en geeft `kiesIllustratie` null: nooit een kapotte pagina.
// Keuze zonder modelaanroep: categorie, binding (nl of fr), trefwoorden, langst niet gebruikt.
import indexJson from "../../public/illustraties/index.json";
import type { BeeldCredit, Categorie } from "./types";

export interface Illustratie {
  id: string;
  categorie: string;
  naam: string;
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
        id: b.id, categorie: b.categorie, naam: b.naam, binding: b.binding === "nl" ? "nl" : "fr",
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

const pad = (u: string) => {
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

/**
 * Kiest een illustratie (besluit 28-11-2026): trefwoord in de kop 2 punten, in de samenvatting 1 (per trefwoord hooguit één keer);
 * de hoogste score over de hele set wint; bij gelijke score de eigen categorie, dan binding nl bij Nederland-onderwerpen (anders fr),
 * dan het langst niet gebruikt (`recent` = beeld-urls, nieuwste eerst; nooit gebruikt telt als het langst geleden), dan de vaste volgorde.
 * Gaat het bericht over Nederland, dan krijgt een nl-beeld met minstens 1 treffer +3 punten; zijn alle scores 0, dan gaat een nl-beeld voor (eigen categorie eerst, anders de hele set).
 * Is de hoogste score 0, dan de keuze in de eigen categorie.
 */
export function kiesIllustratie(b: IllustratieInvoer, recent: string[] = [], lijst: IllustratieLijst = ILLUSTRATIES): Illustratie | null {
  try {
    const alle = lijst.beelden;
    if (!alle.length) return null;
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
    const kandidaten = alle.map((i) => ({ i, s: score(i), eigen: i.categorie === b.categorie ? 1 : 0, bind: i.binding === voorkeur ? 1 : 0, g: geleden(i) }));
    const beter = (x: (typeof kandidaten)[number], y: (typeof kandidaten)[number]) =>
      x.s !== y.s ? x.s > y.s : x.eigen !== y.eigen ? x.eigen > y.eigen : x.bind !== y.bind ? x.bind > y.bind : x.g > y.g;
    const pak = (pool: typeof kandidaten) => pool.reduce<(typeof kandidaten)[number] | null>((m, k) => (!m || beter(k, m) ? k : m), null);
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

/** Resultaat voor opslag: absolute SVG-url en bronvermelding met categorie, naam en PNG-url. Null zonder illustratie. */
export function illustratieResultaat(b: IllustratieInvoer, recent: string[] = [], lijst: IllustratieLijst = ILLUSTRATIES): { url: string; credit: BeeldCredit } | null {
  const i = kiesIllustratie(b, recent, lijst);
  if (!i) return null;
  const basis = basisUrl();
  return {
    url: `${basis}${i.svg}`,
    credit: { bron: "Illustratie", maker: "Communities Abroad", categorie: i.categorie, naam: i.naam, png: `${basis}${i.png}` },
  };
}
