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
 * Kiest een illustratie: eerst de categorie van het bericht; heeft de beste daarin 0 trefwoordtreffers, dan de hoogste score over de hele set (blijft alles 0, dan de keuze in de eigen categorie);
 * bij Nederland-onderwerpen eerst binding nl, anders eerst fr; daarbinnen de meeste trefwoorden in
 * kop en samenvatting; bij gelijke stand het langst niet gebruikte beeld (`recent` = beeld-urls,
 * nieuwste eerst; nooit gebruikt telt als het langst geleden), daarna de vaste volgorde.
 */
export function kiesIllustratie(b: IllustratieInvoer, recent: string[] = [], lijst: IllustratieLijst = ILLUSTRATIES): Illustratie | null {
  try {
    const alle = lijst.beelden;
    if (!alle.length) return null;
    const tekst = `${b.kop || ""} ${b.samenvatting || ""}`;
    const voorkeur = gaatOverNederland(tekst) ? "nl" : "fr";
    const haystack = ` ${normaal(tekst).replace(/[^a-z0-9]+/g, " ")} `;
    const score = (i: Illustratie) => i.trefwoorden.filter((t) => {
      const n = normaal(t).replace(/[^a-z0-9]+/g, " ").trim();
      return n.length > 0 && haystack.includes(` ${n}`);
    }).length;
    const gebruikPlek = new Map<string, number>(); // pad -> plaats in `recent` (0 = nieuwste)
    recent.forEach((u, n) => {
      const p = pad(u);
      if (!gebruikPlek.has(p)) gebruikPlek.set(p, n);
    });
    const geleden = (i: Illustratie) => gebruikPlek.get(pad(i.svg)) ?? Infinity;
    const beste = (pool: Illustratie[]): { i: Illustratie; s: number } | null => {
      const metVoorkeur = pool.filter((i) => i.binding === voorkeur);
      const kand = metVoorkeur.length ? metVoorkeur : pool;
      let uit: { i: Illustratie; s: number } | null = null;
      let bg = -1;
      for (const i of kand) {
        const s = score(i);
        const g = geleden(i);
        if (!uit || s > uit.s || (s === uit.s && g > bg)) ((uit = { i, s }), (bg = g));
      }
      return uit;
    };
    const inCat = alle.filter((i) => i.categorie === b.categorie);
    const eigen = inCat.length ? beste(inCat) : null;
    if (eigen && eigen.s > 0) return eigen.i;
    // Geen treffer in de eigen categorie: de hoogste trefwoordscore over de hele set, zo die er is.
    const overal = beste(alle);
    if (overal && overal.s > 0) return overal.i;
    return (eigen ?? overal)?.i ?? null;
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
