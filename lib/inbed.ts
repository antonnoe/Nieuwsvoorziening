// Inbedvenster /inbed (28-11-2026): drie tabs voor in een iframe op Nederlanders.fr (NING) en andere eigen sites.
// Nieuws en Overheid komen uit de eigen opslag; "NL'ers in FR" leest TIJDELIJK alleen-lezen uit nlfr-menu (/api/actueel)
// tot die bronnen naar deze motor zijn verhuisd.
import type { Opslag, OpgeslagenBericht } from "@/lib/motor/opslag";
import { soortVan } from "@/lib/motor/opslag";
import { BASIS_URL, TZ, veiligeUrl } from "@/lib/site";

export const TABS = ["nieuws", "overheid", "nlfr"] as const;
export type Tab = (typeof TABS)[number];
export const TAB_NAAM: Record<Tab, string> = { nieuws: "Nieuws", overheid: "Overheid", nlfr: "NL'ers in FR" };
export const AANTAL = 15;
export const NLFR_URL = "https://nlfr-menu.vercel.app/api/actueel";
export const NLFR_TEGELS = ["infofrankrijk", "verenigingen"];
export const NLFR_CACHE_MS = 15 * 60_000;
export const NLFR_TIMEOUT_MS = 8000;
export const NLFR_FOUT = "Even niet beschikbaar.";
export const LEEG = "Er is nu geen nieuws in dit onderdeel.";
/** Hoeveel berichten we ophalen om na het filteren op soort er AANTAL over te houden. */
const RUIM = 200;

export const leesTab = (t?: string | null): Tab => ((TABS as readonly string[]).includes(String(t)) ? (t as Tab) : "nieuws");

export interface InbedItem { sleutel: string; titel: string; samenvatting: string; url: string; datum: string; label: string; beeld?: string | null }

/** Gepubliceerd, zichtbaar (niet weg), kanaal actueel aan, juiste soort, nieuwste eerst. */
export function filterBerichten(lijst: OpgeslagenBericht[], soort: "pers" | "overheid"): OpgeslagenBericht[] {
  return lijst
    .filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg" && (b.kanalen ? b.kanalen.actueel !== false : true) && soortVan(b) === soort)
    .sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp))
    .slice(0, AANTAL);
}

export async function laadBerichtItems(opslag: Opslag | null, soort: "pers" | "overheid", categorieNaam: (c: string) => string): Promise<InbedItem[] | null> {
  if (!opslag) return null;
  try {
    const lijst = await opslag.berichten({ limiet: RUIM, kanaal: "actueel" });
    return filterBerichten(lijst, soort).map((b) => ({
      sleutel: b.id, titel: b.kop, samenvatting: b.samenvatting, url: `${BASIS_URL}/bericht/${b.id}`, datum: b.gepubliceerdOp, label: categorieNaam(b.categorie), beeld: b.beeldUrl ? veiligeUrl(b.beeldUrl) : null,
    }));
  } catch {
    return null;
  }
}

interface NlfrArtikel { url?: unknown; titel?: unknown; summary?: unknown; bronMeta?: { naam?: unknown; datum?: unknown } }
let nlfrCache: { op: number; items: InbedItem[] } | null = null;
export const wisNlfrCache = () => { nlfrCache = null; };

/** Alleen de tegels infofrankrijk en verenigingen; per artikel alleen titel, url, summary, bronMeta.naam en datum. Fout of time-out: null. */
export async function laadNlfr(fetchFn: typeof fetch = fetch, nu = Date.now()): Promise<InbedItem[] | null> {
  if (nlfrCache && nu - nlfrCache.op < NLFR_CACHE_MS) return nlfrCache.items;
  try {
    const r = await fetchFn(NLFR_URL, { signal: AbortSignal.timeout(NLFR_TIMEOUT_MS), headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const d = (await r.json()) as { tegels?: { soort?: string; artikelen?: NlfrArtikel[] }[] };
    if (!Array.isArray(d.tegels)) throw new Error("geen tegels");
    const items: InbedItem[] = [];
    for (const t of d.tegels) {
      if (!t || !NLFR_TEGELS.includes(String(t.soort)) || !Array.isArray(t.artikelen)) continue;
      for (const a of t.artikelen) {
        const url = typeof a.url === "string" ? veiligeUrl(a.url) : null;
        const titel = typeof a.titel === "string" ? a.titel.trim() : "";
        if (!url || !titel) continue;
        items.push({
          sleutel: url, titel, url,
          samenvatting: typeof a.summary === "string" ? a.summary.trim() : "",
          label: typeof a.bronMeta?.naam === "string" ? a.bronMeta.naam : "",
          datum: typeof a.bronMeta?.datum === "string" ? a.bronMeta.datum : "",
        });
      }
    }
    items.sort((a, b) => b.datum.localeCompare(a.datum));
    const uit = items.slice(0, AANTAL);
    nlfrCache = { op: nu, items: uit };
    return uit;
  } catch {
    return nlfrCache ? nlfrCache.items : null; // bij een storing liever de laatste goede stand dan niets
  }
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, ...o });
/** "Bijgewerkt"-tekst uit een echte tijd: vandaag 14.46 uur, anders 27 november 14.46 uur. */
export function bijgewerktTekst(iso: string | undefined, nu = Date.now()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tijd = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(":", ".");
  const dag = (x: Date) => fmt({ year: "numeric", month: "numeric", day: "numeric" }).format(x);
  return dag(d) === dag(new Date(nu)) ? `Bijgewerkt vandaag ${tijd} uur` : `Bijgewerkt ${fmt({ day: "numeric", month: "long" }).format(d)} ${tijd} uur`;
}

export const datumItem = (iso: string) => (iso && !Number.isNaN(new Date(iso).getTime()) ? fmt({ day: "numeric", month: "long" }).format(new Date(iso)) : "");

/** Tijd van de laatste geslaagde oogstrun (klaarOp is gezet); een lopende of afgebroken run telt niet. */
export async function laadBijgewerkt(opslag: Opslag | null): Promise<string | undefined> {
  if (!opslag) return undefined;
  try {
    const run = await opslag.laatsteRun();
    return run?.klaarOp || undefined;
  } catch {
    return undefined;
  }
}
