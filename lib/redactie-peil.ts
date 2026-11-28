// PEIL in de redactie-app (besluit opdrachtgever 28-11-2026): per bericht een blok, in de lijst kleine labels en een eigen scherm
// /redactie/peil voor de beheerder met de open signalen in gewone taal. PEIL zelf wordt nooit aangepast: alleen de status van een signaal.
// Los van de pagina's zodat het getest kan worden.
import type { Opslag, OpgeslagenBericht } from "@/lib/motor/opslag";
import { groenePeil, type PeilBesluit, type PeilSignaalRij } from "@/lib/motor/types";
import { peilVorm } from "@/lib/redactie";
import { TIJDELIJK_MELDING } from "@/lib/redactie-melding";

export const PEIL_URL = "https://communitiesabroad.com/peil";

export interface PeilBlokRegel {
  /** Lezerstitel uit nv_peil_lezerszin, anders de PEIL-naam. */
  naam: string;
  nieuw: string | null;
  vanaf: string | null;
}
export interface PeilBlokOranje {
  naam: string;
  nieuw: string | null;
  vanaf: string | null;
}
export interface PeilBlokData {
  groen: PeilBlokRegel[];
  /** Alleen gevuld voor de beheerder. */
  oranje: PeilBlokOranje[];
}

/** De lezerstitel van een PEIL-parameter, anders de PEIL-naam. */
export const peilNaam = (id: string, naam: string, zinnen: Map<string, { titel?: string }>) => (zinnen.get(id)?.titel || "").trim() || naam;

/** Alleen echt leesbare tekst: een lege waarde of een datum-achtige null wordt weggelaten. */
const schoon = (t: string | null | undefined) => (t && t.trim() && !/^(null|undefined|onbekend)$/i.test(t.trim()) ? t.trim() : null);

/**
 * Wat het PEIL-blok bij een bericht toont. Groen: de groene koppelingen van het bericht (nieuwe waarde en datum uit het open signaal van
 * dezelfde parameter, als dat er is). Oranje: open signalen van soort wijziging met zekerheid oranje, alleen voor de beheerder.
 * Zonder groene of (voor de beheerder) oranje regel is het resultaat leeg en toont de pagina geen blok.
 */
export function peilBlokData(b: Pick<OpgeslagenBericht, "id" | "peil">, signalen: PeilSignaalRij[], zinnen: Map<string, { titel?: string }>, beheerder: boolean): PeilBlokData {
  const eigen = signalen.filter((s) => s.berichtId === b.id && s.status === "gesignaleerd");
  const groen = groenePeil(b.peil?.raakt).map((r) => {
    const s = eigen.find((x) => x.parameterId === r.id && x.soort === "wijziging");
    return { naam: peilNaam(r.id, r.naam, zinnen), nieuw: schoon(s?.nieuweWaarde), vanaf: schoon(s?.vanaf) };
  });
  const oranje = beheerder
    ? eigen.filter((s) => s.soort === "wijziging" && s.zekerheid === "oranje").map((s) => ({ naam: peilNaam(s.parameterId, s.titel || s.parameterNaam, zinnen), nieuw: schoon(s.nieuweWaarde), vanaf: schoon(s.vanaf) }))
    : [];
  return { groen, oranje };
}
export const heeftPeilBlok = (d: PeilBlokData) => d.groen.length > 0 || d.oranje.length > 0;

/** Lezen voor het blok; een storing of ontbrekende migratie laat het bericht niet falen (dan alleen de groene koppelingen zonder waarde). */
export async function laadPeilBlok(opslag: Opslag, b: OpgeslagenBericht, beheerder: boolean): Promise<PeilBlokData> {
  const [signalen, zinnen] = await Promise.all([
    opslag.peilSignalen(200).catch(() => [] as PeilSignaalRij[]),
    opslag.lezerszinnen().catch(() => new Map<string, { hash: string; zin: string; titel?: string }>()),
  ]);
  return peilBlokData(b, signalen, zinnen, beheerder);
}

/** Labels in de lijstrij: "PEIL" bij een groene koppeling, "€" bij portemonnee. */
export function rijLabels(b: Pick<OpgeslagenBericht, "peil" | "portemonnee">): string[] {
  const l: string[] = [];
  if (groenePeil(b.peil?.raakt).length > 0) l.push("PEIL");
  if (b.portemonnee === true) l.push("€");
  return l;
}

/** De regel "Raakt PEIL: <naam>" met eventueel nieuwe waarde en datum. */
export function groeneRegelTekst(r: PeilBlokRegel): string {
  const extra = [r.nieuw ? `nieuwe waarde ${r.nieuw}` : null, r.vanaf ? `vanaf ${r.vanaf}` : null].filter(Boolean).join(", ");
  return `Raakt PEIL: ${r.naam}${extra ? ` (${extra})` : ""}`;
}
export function oranjeRegelTekst(r: PeilBlokOranje): string {
  const extra = [r.nieuw ? `nieuwe waarde ${r.nieuw}` : null, r.vanaf ? `vanaf ${r.vanaf}` : null].filter(Boolean).join(", ");
  return `Mogelijk PEIL: ${r.naam}${extra ? ` (${extra})` : ""} (niet zeker, wordt niet aan lezers getoond)`;
}

// ---- Het scherm /redactie/peil ----------------------------------------------------------------------------------

/** De vijf knoppen in gewone taal, in vaste volgorde, met het besluit dat erachter zit. */
export const PEIL_KNOPPEN: { keuze: PeilBesluit; tekst: string; hoofd?: boolean }[] = [
  { keuze: "vastgesteld", tekst: "Klopt, PEIL bijwerken", hoofd: true },
  { keuze: "verwacht", tekst: "Klopt, maar nog niet zeker" },
  { keuze: "raakt_niet", tekst: "Raakt PEIL niet" },
  { keuze: "lijst", tekst: "Op de lijst voor PEIL" },
  { keuze: "niet_nodig", tekst: "Niet nodig" },
];

const MELDINGEN: Record<PeilBesluit, string> = {
  vastgesteld: "Genoteerd: dit klopt. PEIL zelf is niet aangepast; het signaal staat nu klaar om PEIL bij te werken.",
  verwacht: "Genoteerd: dit klopt, maar het is nog niet zeker. PEIL zelf is niet aangepast.",
  raakt_niet: "Genoteerd: dit raakt PEIL niet. De koppeling bij het bericht is weggehaald; PEIL zelf is niet aangepast.",
  lijst: "Genoteerd: dit komt op de lijst voor PEIL. PEIL zelf is niet aangepast.",
  niet_nodig: "Genoteerd: dit is niet nodig. PEIL zelf is niet aangepast.",
};
export const peilMelding = (k: PeilBesluit) => MELDINGEN[k];

export interface PeilVraag {
  id: string;
  titel: string;
  /** Wat er volgens het bericht verandert, in één zin gewone taal; null als het bericht daar niets over zegt. */
  verandert: string | null;
  twijfel: string | null;
  citaat: string | null;
  berichtId: string;
  berichtKop: string;
  soort: "wijziging" | "ontbreekt";
  /** Welke knop de machine adviseert (alleen een aanwijzing). */
  advies: PeilBesluit;
  aantal: number;
}

/** Een open signaal als vraag in gewone taal (geen PEIL-ids). Hergebruikt peilVorm voor het advies. */
export function peilVraag(x: PeilSignaalRij): PeilVraag {
  const v = peilVorm(x);
  let verandert: string | null = null;
  if (x.soort === "ontbreekt") verandert = "Dit onderwerp staat nog niet in PEIL.";
  else {
    const van = schoon(x.huidigeWaarde), naar = schoon(x.nieuweWaarde), datum = schoon(x.vanaf);
    if (van && naar) verandert = `Volgens het bericht gaat het van ${van} naar ${naar}${datum ? `, vanaf ${datum}` : ""}.`;
    else if (naar) verandert = `Volgens het bericht wordt het ${naar}${datum ? `, vanaf ${datum}` : ""}.`;
    else if (datum) verandert = `Volgens het bericht verandert dit vanaf ${datum}.`;
  }
  return { id: x.id, titel: x.titel || x.parameterNaam, verandert, twijfel: schoon(x.twijfel), citaat: schoon(x.citaat), berichtId: x.berichtId, berichtKop: x.berichtKop, soort: x.soort, advies: v.advies, aantal: x.aantal };
}

/** De open PEIL-signalen voor het scherm en de teller. Een storing of ontbrekende migratie geeft null (het scherm zegt dan dat het tijdelijk niet werkt). */
export async function laadPeilVragen(opslag: Opslag): Promise<PeilVraag[] | null> {
  try {
    return (await opslag.peilSignalen(200)).map(peilVraag);
  } catch {
    return null;
  }
}
export const PEIL_STORING = TIJDELIJK_MELDING;
