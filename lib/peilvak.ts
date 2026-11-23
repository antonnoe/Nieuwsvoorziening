// Vak "Wat verandert er voor u": aangekondigde wijzigingen uit PEIL (besluit
// 23-11-2026). Alleen lezen uit de openbare PEIL-export; faalt stil (geen vak).
import { veiligeUrl } from "./site";

const EXPORT = process.env.PEIL_URL || "https://communitiesabroad.com/manifest/peil-zoek.json";

export interface Aankondiging {
  id: string;
  naam: string;
  datum: string | null; // ISO-datum of null (nog geen datum)
  omschrijving: string;
  voorlopig: boolean;
  tools: { naam: string; url: string | null }[];
}

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

/** Kiest de eerstvolgende aankondigingen: met datum vanaf vandaag oplopend, daarna die zonder datum. */
export function kiesAankondigingen(parameters: Ruw[], vandaag: string, max = 4): { lijst: Aankondiging[]; totaal: number } {
  const alle = parameters.filter((p) => p && p.id && p.naam && p.aangekondigd && p.aangekondigd.omschrijving);
  const lijst = alle
    .map((p) => {
      const { tekst, voorlopig } = netjes(p.aangekondigd!.omschrijving!);
      const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(p.aangekondigd!.datum || "")) ? String(p.aangekondigd!.datum) : null;
      const tools = (p.tools || []).filter((t) => t && t.naam).map((t) => ({ naam: String(t.naam), url: t.url ? veiligeUrl(t.url) : null }));
      return { id: String(p.id), naam: String(p.naam), datum, omschrijving: tekst, voorlopig, tools };
    })
    .filter((a) => a.omschrijving && (a.datum === null || a.datum >= vandaag))
    .sort((a, b) => (a.datum && b.datum ? a.datum.localeCompare(b.datum) : a.datum ? -1 : b.datum ? 1 : a.naam.localeCompare(b.naam)));
  // Variatie: niet twee keer hetzelfde onderwerp (zelfde tool) achter elkaar in het vak.
  const gekozen: Aankondiging[] = [];
  const gezien = new Set<string>();
  for (const a of lijst) {
    const sleutel = a.tools.length ? a.tools.map((t) => t.naam).sort().join("|") : `id:${a.id}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    gekozen.push(a);
    if (gekozen.length === max) break;
  }
  return { lijst: gekozen, totaal: alle.length };
}

export async function laadAankondigingen(max = 4): Promise<{ lijst: Aankondiging[]; totaal: number }> {
  try {
    const r = await fetch(EXPORT, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { lijst: [], totaal: 0 };
    const d = (await r.json()) as { parameters?: Ruw[] };
    const vandaag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    return kiesAankondigingen(Array.isArray(d.parameters) ? d.parameters : [], vandaag, max);
  } catch {
    return { lijst: [], totaal: 0 };
  }
}
