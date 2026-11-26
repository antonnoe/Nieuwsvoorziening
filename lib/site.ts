// Hulpjes voor de publieke pagina's: lezen uit de opslag (server-side), opmaak van datums, categorielabels.
import { leesOpslag } from "./motor/api";
import type { Opslag } from "./motor/opslag";
import { dagStart } from "./motor/tijd";
import { CATEGORIEEN, groenePeil, type Categorie } from "./motor/types";
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
  return groenePeil(b.peil.raakt).map((p) => ({ naam: p.naam, wordtNagelopen: gewijzigd.has(p.id), tools: (p.tools || []).map((t) => ({ naam: t.naam, url: t.url || null })) }));
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
export async function laadVoorpagina(opt: { categorie?: Categorie; peil?: boolean; pagina: number; opslag?: Opslag | null }): Promise<Voorpagina> {
  const opslag = opt.opslag === undefined ? leesOpslag() : opt.opslag;
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

/**
 * Categorieën met minstens één gepubliceerd bericht in de laatste 30 dagen, of null als de telling mislukt
 * (dan toont de pagina alle knoppen).
 */
export async function laadActieveCategorieen(opslagIn?: Opslag | null, nu = Date.now()): Promise<Set<string> | null> {
  const opslag = opslagIn === undefined ? leesOpslag() : opslagIn;
  if (!opslag) return null;
  try {
    const t = await opslag.tellingenSinds(new Date(nu - 30 * 86400_000).toISOString());
    return new Set(Object.entries(t).filter(([, n]) => n > 0).map(([c]) => c));
  } catch {
    return null;
  }
}

/**
 * Drie verwante berichten voor "Verder lezen", nooit het bericht zelf: eerst dezelfde categorie, dan berichten die
 * dezelfde PEIL-parameter raken, en bij te weinig de nieuwste andere berichten.
 */
export async function laadVerwant(b: { id: string; categorie: Categorie; peil?: { raakt: { id: string; zekerheid?: string }[] } }, opslagIn?: Opslag | null): Promise<OpgeslagenBericht[]> {
  const opslag = opslagIn === undefined ? leesOpslag() : opslagIn;
  if (!opslag) return [];
  try {
    const uit: OpgeslagenBericht[] = [];
    const voeg = (lijst: OpgeslagenBericht[]) => {
      for (const x of lijst) if (uit.length < 3 && x.id !== b.id && !uit.some((u) => u.id === x.id)) uit.push(x);
    };
    voeg(await opslag.berichten({ categorie: b.categorie, limiet: 6 }));
    const ids = new Set(groenePeil(b.peil?.raakt).map((p) => p.id));
    if (uit.length < 3 && ids.size) {
      const metPeil = await opslag.berichten({ peil: true, limiet: 30 });
      voeg(metPeil.filter((x) => groenePeil(x.peil.raakt).some((p) => ids.has(p.id))));
    }
    if (uit.length < 3) voeg(await opslag.berichten({ limiet: 8 }));
    return uit;
  } catch {
    return [];
  }
}
