// Inbedvenster /inbed/zijbalk (28-11-2026): smalle zijbalk (173 px, 160 tot 200 px moet ook) voor Nederlanders.fr en Infofrankrijk, vervangt nlfr-menu /sidebar-nieuws.
// PEIL streng: alleen groene koppelingen. Links gaan naar ons eigen bericht, nooit naar een krant.
import type { Opslag, OpgeslagenBericht } from "@/lib/motor/opslag";
import type { Aankondiging } from "@/lib/peilvak";
import { groenePeil, leesKanalen, type Kanaal } from "@/lib/motor/types";
import { BASIS_URL, PEIL_URL, veiligeUrl } from "@/lib/site";

export const ZIJBALK_BERICHTEN = 10;
export const ZIJBALK_BERICHTEN_MAX = 20;
export const ZIJBALK_PEIL = 4;
export const ZIJBALK_PEIL_MAX = 8;

/** Geheel getal binnen min en max uit een queryparameter; leeg of onzin geeft de standaard. */
export function begrensd(waarde: string | null | undefined, standaard: number, min: number, max: number): number {
  const t = String(waarde ?? "").trim();
  if (!/^\d+$/.test(t)) return standaard;
  return Math.min(max, Math.max(min, Number(t)));
}
/** ?aantal= (berichten, 1 tot 20, standaard 10). */
export const zijbalkAantal = (v?: string | null) => begrensd(v, ZIJBALK_BERICHTEN, 1, ZIJBALK_BERICHTEN_MAX);
/** ?peil= (aankondigingen, 0 tot 8, standaard 4; 0 laat het blok weg). */
export const zijbalkPeilAantal = (v?: string | null) => begrensd(v, ZIJBALK_PEIL, 0, ZIJBALK_PEIL_MAX);
export const ZIJBALK_LEEG = "Er is nu geen nieuws.";
export const MEER_NIEUWS_URL = "https://nieuws.infofrankrijk.com";
export const PORTEMONNEE_CHIP = "€ raakt uw portemonnee";

/** ?kanaal=infofrankrijk geeft kanaal infofrankrijk, al het andere kanaal zijbalk. */
export const zijbalkKanaal = (k?: string | null): Kanaal => (k === "infofrankrijk" ? "infofrankrijk" : "zijbalk");

export interface ZijbalkChip { soort: "peil" | "portemonnee"; tekst: string; url: string | null }
export interface ZijbalkItem { id: string; titel: string; url: string; datum: string; label: string; beeld: string | null; chips: ZijbalkChip[] }
export interface ZijbalkPeilRegel { id: string; titel: string; datum: string | null; inDiscussie: boolean; zin: string; tool: { naam: string; url: string | null } | null }

/** Chips van één bericht: PEIL alleen bij een groene koppeling met een lezerstitel (nooit de PEIL-naam), anders eventueel "€ raakt uw portemonnee". */
export function chipsVan(b: OpgeslagenBericht, titels: Map<string, { titel?: string }>): ZijbalkChip[] {
  const chips: ZijbalkChip[] = [];
  for (const p of groenePeil(b.peil?.raakt)) {
    const t = String(titels.get(p.id)?.titel || "").trim();
    if (t) { chips.push({ soort: "peil", tekst: `PEIL: ${t}`, url: PEIL_URL }); break; }
  }
  if (!chips.length && b.portemonnee === true) chips.push({ soort: "portemonnee", tekst: PORTEMONNEE_CHIP, url: null });
  return chips;
}

export function filterZijbalk(lijst: OpgeslagenBericht[], kanaal: Kanaal, aantal: number = ZIJBALK_BERICHTEN): OpgeslagenBericht[] {
  return lijst
    .filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg" && leesKanalen(b.kanalen)[kanaal])
    .sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp))
    .slice(0, aantal);
}

/** null bij een storing in de opslag, een lege lijst als er niets is. */
export async function laadZijbalkItems(opslag: Opslag | null, kanaal: Kanaal, categorieNaam: (c: string) => string, aantal: number = ZIJBALK_BERICHTEN): Promise<ZijbalkItem[] | null> {
  if (!opslag) return null;
  try {
    const [lijst, titels] = await Promise.all([opslag.berichten({ limiet: 80, kanaal }), opslag.lezerszinnen().catch(() => new Map<string, { titel?: string }>())]);
    return filterZijbalk(lijst, kanaal, aantal).map((b) => ({
      id: b.id, titel: b.kop, url: `${BASIS_URL}/bericht/${b.id}`, datum: b.gepubliceerdOp, label: categorieNaam(b.categorie),
      beeld: b.beeldUrl ? veiligeUrl(b.beeldUrl) : null, chips: chipsVan(b, titels),
    }));
  } catch {
    return null;
  }
}

/** De eerstvolgende aankondigingen uit het PEIL-vak (al met geldige lezerszin en titel), met hooguit één tool per regel. */
export function peilRegels(lijst: Aankondiging[] | null | undefined, aantal: number = ZIJBALK_PEIL): ZijbalkPeilRegel[] {
  return (lijst || []).slice(0, aantal).map((a) => ({
    id: a.id, titel: a.naam, datum: a.datum, inDiscussie: a.inDiscussie || a.datum === null, zin: a.omschrijving, tool: a.tools[0] ? { naam: a.tools[0].naam, url: a.tools[0].url } : null,
  }));
}
