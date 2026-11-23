// Hulpjes voor de publieke pagina's: lezen uit de opslag (server-side), opmaak van datums, categorielabels.
import { leesOpslag } from "./motor/api";
import { dagStart } from "./motor/tijd";
import { CATEGORIEEN, type Categorie } from "./motor/types";
import type { OpgeslagenBericht } from "./motor/opslag";

export const BASIS_URL = (process.env.NIEUWS_BASIS_URL || "https://nieuws.infofrankrijk.com").replace(/\/+$/, "");
export const PEIL_URL = "https://communitiesabroad.com/peil";
export const TZ = "Europe/Amsterdam";
export const PAGINA_GROOTTE = 12;

export const CATEGORIE_KNOP: Record<Categorie, string> = {
  algemeen: "Algemeen",
  politiek: "Politiek",
  "economie en ondernemen": "Economie en ondernemen",
  "reizen en verkeer": "Reizen en verkeer",
  "natuur en rampen": "Natuur en rampen",
  "toerisme en evenementen": "Toerisme",
  merkwaardig: "Merkwaardig",
};
export const CATEGORIE_VOL: Record<Categorie, string> = { ...CATEGORIE_KNOP, "toerisme en evenementen": "Toerisme en evenementen" };
export const categorieSlug = (c: string) => c.replace(/ /g, "-");
export const slugNaarCategorie = (s?: string): Categorie | undefined => {
  const n = (s || "").trim().toLowerCase().replace(/-/g, " ");
  return (CATEGORIEEN as readonly string[]).includes(n) ? (n as Categorie) : undefined;
};

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, ...o });
export const datumKort = (iso: string) => fmt({ day: "numeric", month: "long" }).format(new Date(iso));
export const datumLang = (iso: string) => fmt({ day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
export const datumMetDag = (iso: string) => {
  const d = new Date(iso);
  return `${fmt({ weekday: "long", day: "numeric", month: "long" }).format(d)}, ${fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(":", ".")} uur`;
};
export function leestijd(b: { tekst: string; samenvatting: string }): number {
  const woorden = `${b.samenvatting} ${b.tekst}`.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(woorden / 200));
}
export const aantalBronnen = (n: number) => (n === 1 ? "1 bron" : `${n} bronnen`);

export interface PeilWeergave { naam: string; wordtNagelopen: boolean; tools: { naam: string; url: string | null }[] }
export function peilWeergave(b: OpgeslagenBericht): PeilWeergave[] {
  const gewijzigd = new Set(b.peil.mogelijkGewijzigd.map((g) => g.id));
  return b.peil.raakt.map((p) => ({ naam: p.naam, wordtNagelopen: gewijzigd.has(p.id), tools: (p.tools || []).map((t) => ({ naam: t.naam, url: t.url || null })) }));
}
export const uniekeTools = (p: PeilWeergave[]) => {
  const m = new Map<string, { naam: string; url: string | null }>();
  for (const x of p) for (const t of x.tools) if (t.naam && !m.has(t.naam)) m.set(t.naam, t);
  return [...m.values()];
};

export interface Voorpagina {
  uitgelicht: OpgeslagenBericht | null;
  kaarten: OpgeslagenBericht[];
  meer: boolean;
  fout: boolean;
}
/** Pagina 1: 1 uitgelicht + 12 kaarten; daarna 12 kaarten per pagina. */
export async function laadVoorpagina(opt: { categorie?: Categorie; peil?: boolean; pagina: number }): Promise<Voorpagina> {
  const opslag = leesOpslag();
  if (!opslag) return { uitgelicht: null, kaarten: [], meer: false, fout: true };
  const eerste = opt.pagina <= 1;
  const offset = eerste ? 0 : 1 + PAGINA_GROOTTE * (opt.pagina - 1);
  const aantal = eerste ? 1 + PAGINA_GROOTTE : PAGINA_GROOTTE;
  try {
    const lijst = await opslag.berichten({ categorie: opt.categorie, peil: opt.peil, limiet: aantal + 1, offset });
    const meer = lijst.length > aantal;
    const deze = lijst.slice(0, aantal);
    return eerste ? { uitgelicht: deze[0] || null, kaarten: deze.slice(1), meer, fout: false } : { uitgelicht: null, kaarten: deze, meer, fout: false };
  } catch {
    return { uitgelicht: null, kaarten: [], meer: false, fout: true };
  }
}

export interface Statusregel { bijgewerkt?: string; vandaag?: number; bronnen?: number }
/** Echte tellers uit de opslag; wat geen data heeft blijft weg. */
export async function laadStatus(): Promise<Statusregel> {
  const opslag = leesOpslag();
  const s: Statusregel = {};
  if (!opslag) return s;
  try {
    const [run, vandaag] = await Promise.all([opslag.laatsteRun(), opslag.telGepubliceerdSinds(dagStart())]);
    if (run) {
      s.bijgewerkt = run.klaarOp || run.gestartOp;
      if (run.gestartOp >= dagStart()) {
        const n = run.aantallen.bronnenOk ?? run.aantallen.bronnen;
        if (typeof n === "number" && n > 0) s.bronnen = n;
      }
    }
    if (vandaag > 0) s.vandaag = vandaag;
  } catch {
    /* tellers weglaten */
  }
  return s;
}

export async function laadBericht(id: string) {
  const opslag = leesOpslag();
  if (!opslag) return null;
  try {
    return await opslag.bericht(id);
  } catch {
    return null;
  }
}

export function veiligeUrl(u: string): string | null {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null;
  } catch {
    return null;
  }
}

/** Drie verwante berichten voor "Verder lezen": eerst dezelfde categorie, daarna de nieuwste. */
export async function laadVerwant(b: { id: string; categorie: Categorie }): Promise<OpgeslagenBericht[]> {
  const opslag = leesOpslag();
  if (!opslag) return [];
  try {
    const zelfde = (await opslag.berichten({ categorie: b.categorie, limiet: 4 })).filter((x) => x.id !== b.id);
    if (zelfde.length >= 3) return zelfde.slice(0, 3);
    const rest = (await opslag.berichten({ limiet: 6 })).filter((x) => x.id !== b.id && !zelfde.some((z) => z.id === x.id));
    return [...zelfde, ...rest].slice(0, 3);
  } catch {
    return [];
  }
}
