// Vak "Wat verandert er voor u": aangekondigde wijzigingen uit PEIL (besluit
// 23-11-2026). Alleen lezen uit de openbare PEIL-export; faalt stil (geen vak).
import { veiligeUrl } from "./site";
import { leesOpslag } from "./motor/api";
import { groenePeil } from "./motor/types";
import { peilRaaktNlInFrankrijk } from "./peil-nl-filter";
import { GEEN_ZIN, hashOmschrijving } from "./motor/lezerszin";

const EXPORT = process.env.PEIL_URL || "https://communitiesabroad.com/manifest/peil-zoek.json";

export interface Aankondiging {
  id: string;
  /** Korte Nederlandse titel (uit lezerszin.ts); dit is de naam die lezers zien. */
  naam: string;
  /** De naam in PEIL (jargon), alleen ter herkenning in de API. */
  peilNaam: string;
  datum: string | null; // ISO-datum of null (nog geen datum)
  omschrijving: string;
  voorlopig: boolean;
  tools: { naam: string; url: string | null }[];
  /** Gepubliceerde nieuwsberichten die deze parameter raken (nieuwste eerst, hooguit 2). */
  nieuws: { id: string; kop: string }[];
  /** Nog in politieke discussie, zonder datum. */
  inDiscussie: boolean;
}

export type NieuwsPerParameter = Map<string, { id: string; kop: string }[]>;
const DISCUSSIE = /discussie|voorstel|nog geen besluit|wetsvoorstel|amendement/i;

type Ruw = { id?: string; naam?: string; tools?: { naam?: string; url?: string }[]; aangekondigd?: { datum?: string | null; omschrijving?: string } | null };

/** Maakt de omschrijving leesbaar: "(raming)" wordt een label, lange tekst wordt bij een zinsgrens ingekort. */
export function netjes(omschrijving: string, max = 240): { tekst: string; voorlopig: boolean } {
  let t = String(omschrijving || "").replace(/\s+/g, " ").trim();
  const voorlopig = /\(raming\)/i.test(t);
  t = t.replace(/\s*\(raming\)\s*/gi, " ").trim();
  if (t.length > max) {
    const knip = t.slice(0, max);
    // Zinsgrens: ". " of "; " gevolgd door een hoofdletter of cijfer, niet na een afkorting als "art." of "nr.".
    let punt = -1;
    for (const m of knip.matchAll(/(?<!\b(?:art|nr|n°|al|lid|blz|o\.a|bijv|resp))[.;] (?=[A-ZÀ-Ý0-9])/g)) punt = m.index!;
    t = (punt > 80 ? knip.slice(0, punt) : knip.slice(0, knip.lastIndexOf(" "))).replace(/[;,:]$/, "") + (punt > 80 ? "." : " …");
  }
  if (t && !/[.!?…]$/.test(t)) t += ".";
  return { tekst: t ? t[0].toUpperCase() + t.slice(1) : t, voorlopig };
}

/**
 * Volgorde in het vak (besluit 23-11-2026): eerst wijzigingen waarover nieuws is verschenen, dan hooguit twee
 * die nog in politieke discussie zijn (zonder datum, zoals de 10%-aftrek op pensioenen), dan de eerstvolgende
 * met een datum. Per tool hooguit één regel.
 */
export function kiesAankondigingen(parameters: Ruw[], vandaag: string, max = 4, zinnen: Map<string, { hash: string; zin: string; titel?: string }> = new Map(), nieuws: NieuwsPerParameter = new Map()): { lijst: Aankondiging[]; totaal: number } {
  // Nederlandse items alleen als ze Nederlanders in Frankrijk raken (lib/peil-nl-filter.ts); daarna vult het vak aan met het volgende geschikte item.
  const alle = parameters.filter((p) => p && p.id && p.naam && p.aangekondigd && p.aangekondigd.omschrijving && peilRaaktNlInFrankrijk(String(p.id)));
  const lijst = alle
    .flatMap((p): Aankondiging[] => {
      const om = p.aangekondigd!.omschrijving!;
      const { voorlopig } = netjes(om);
      // Alleen een geldige leesbare zin die bij de huidige omschrijving hoort; nooit de ruwe PEIL-tekst, nooit "GEEN".
      const z = zinnen.get(String(p.id));
      if (!z || z.hash !== hashOmschrijving(om) || !z.zin || z.zin.trim().toUpperCase() === GEEN_ZIN) return [];
      // Zonder korte titel geen regel: nooit de PEIL-naam met jargon tonen.
      const titel = String(z.titel || "").trim();
      if (!titel) return [];
      const tekst = netjes(z.zin, 400).tekst;
      const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(p.aangekondigd!.datum || "")) ? String(p.aangekondigd!.datum) : null;
      const tools = (p.tools || []).filter((t) => t && t.naam).map((t) => ({ naam: String(t.naam), url: t.url ? veiligeUrl(t.url) : null }));
      const inDiscussie = datum === null && DISCUSSIE.test(om);
      return [{ id: String(p.id), naam: titel, peilNaam: String(p.naam), datum, omschrijving: tekst, voorlopig: voorlopig || inDiscussie, tools, nieuws: (nieuws.get(String(p.id)) || []).slice(0, 2), inDiscussie }];
    })
    .filter((a) => a.omschrijving && (a.datum === null || a.datum >= vandaag));
  const rang = (a: Aankondiging) => (a.nieuws.length ? 0 : a.inDiscussie ? 1 : a.datum ? 2 : 3);
  lijst.sort((a, b) => rang(a) - rang(b) || (a.datum && b.datum ? a.datum.localeCompare(b.datum) : 0) || a.naam.localeCompare(b.naam));
  let discussie = 0;
  // Variatie: niet twee keer hetzelfde onderwerp (zelfde tool) achter elkaar in het vak.
  const gekozen: Aankondiging[] = [];
  const gezien = new Set<string>();
  for (const a of lijst) {
    const sleutel = a.tools.length ? a.tools.map((t) => t.naam).sort().join("|") : `id:${a.id}`;
    if (gezien.has(sleutel)) continue;
    if (a.inDiscussie && !a.nieuws.length && ++discussie > 2) continue;
    gezien.add(sleutel);
    gekozen.push(a);
    if (gekozen.length === max) break;
  }
  return { lijst: gekozen, totaal: alle.length };
}

export async function laadAankondigingen(max = 4): Promise<{ lijst: Aankondiging[]; totaal: number }> {
  try {
    // Hooguit een uur oud (was zes uur): een correctie in PEIL moet dezelfde ochtend in het vak en de nieuwsbrief staan (26-11-2026,
    // AOW-leeftijd). Zonder verse export past de bewaarde zin niet bij de oude omschrijving en valt het item weg.
    const r = await fetch(EXPORT, { headers: { accept: "application/json" }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { lijst: [], totaal: 0 };
    const d = (await r.json()) as { parameters?: Ruw[] };
    const vandaag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    const opslag = leesOpslag();
    const [zinnen, berichten] = await Promise.all([
      opslag?.lezerszinnen().catch(() => undefined),
      opslag?.berichten({ limiet: 60, peil: true }).catch(() => []) ?? Promise.resolve([]),
    ]);
    const nieuws: NieuwsPerParameter = new Map();
    for (const b of berichten || []) for (const r of groenePeil(b.peil?.raakt)) nieuws.set(r.id, [...(nieuws.get(r.id) || []), { id: b.id, kop: b.kop }]);
    return kiesAankondigingen(Array.isArray(d.parameters) ? d.parameters : [], vandaag, max, zinnen, nieuws);
  } catch {
    return { lijst: [], totaal: 0 };
  }
}
