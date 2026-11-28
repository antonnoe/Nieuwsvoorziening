// De bronnenlijst (28-11-2026): de motor leest bronnen uit de tabel nv_bronnen; ontbreekt de tabel, faalt de lezing of is ze leeg,
// dan valt hij terug op data/bronnen.json (plus The Connexion als radarbron). Daarmee werkt alles ook zonder migratie.
// Hier staat ook de harde scheiding: een domein dat radarbron is, kan nooit nieuwsbron zijn (`zetRadarDomeinen` voedt `isVerbodenBron`).
import { CONNEXION_SITEMAP_URL, isVerbodenBron, kaleHost, laadBronnen, zetRadarDomeinen } from "./config";
import type { Opslag } from "./opslag";
import type { Bron, BronRij, Groep, Regime } from "./types";

/** Uitsluitlijst van The Connexion: de standaardlijst uit radar.ts staat in de migratie en in de code; hier alleen de verwijzing. */
export const CONNEXION_RADARBRON_ID = "connexion-radar";

/** Een bron uit het terugvalbestand als rij (zonder leesgegevens). */
export function bronRijUitJson(b: Bron): BronRij {
  return { ...b, soort: "nieuws", actief: true, toegevoegdOp: null, toegevoegdDoor: null, laatstGelezen: null, laatstItems: null, laatsteFout: null, uitsluit: null };
}

/** De eerste radarbron: The Connexion (nieuwssitemap), met de standaard uitsluitlijst (`uitsluit: null`). */
export function connexionRadarbron(): BronRij {
  return {
    id: CONNEXION_RADARBRON_ID, naam: "The Connexion (radar)", feed: CONNEXION_SITEMAP_URL, domein: "connexionfrance.com", taal: "en", land: "FR",
    groep: "buitenlandse_pers", regime: "pers", status: "ACTIVE", prioriteit: 3, frankrijkFilter: false, vensterUren: 72,
    notitie: "Uitsluitend onderwerpsignaal voor de radar; nooit bron.", soort: "radar", actief: true, toegevoegdOp: null, toegevoegdDoor: null,
    laatstGelezen: null, laatstItems: null, laatsteFout: null, uitsluit: null,
  };
}

/** Terugvallijst: data/bronnen.json plus The Connexion als radarbron. */
export function terugvalBronnen(): BronRij[] {
  return [...laadBronnen().map(bronRijUitJson), connexionRadarbron()];
}

export interface BronnenLijst {
  rijen: BronRij[];
  /** True als de rijen uit de tabel nv_bronnen komen; false bij de terugval op data/bronnen.json. */
  uitTabel: boolean;
  /** Waarom de terugval is gebruikt (voor het scherm en de run), of null. */
  terugvalReden: string | null;
}

/** Radardomeinen uit een lijst rijen (alleen actieve radarbronnen tellen als radar; een uitgeschakelde radarbron blokkeert niets meer). */
export const radarDomeinenVan = (rijen: BronRij[]) => rijen.filter((r) => r.soort === "radar" && r.actief).map((r) => kaleHost(r.domein || r.feed));

/**
 * Leest de bronnenlijst (tabel, anders terugval) en zet daarna meteen de radardomeinen, zodat `isVerbodenBron` ze meeneemt.
 * Faalt nooit: bij een storing de terugval, en de vaste lijst (connexionfrance.com) geldt altijd.
 */
export async function laadBronnenLijst(opslag: Opslag | null | undefined): Promise<BronnenLijst> {
  let res: BronnenLijst;
  try {
    if (!opslag) throw new Error("geen opslag");
    const rijen = await opslag.bronnenLijst();
    res = rijen.length ? { rijen, uitTabel: true, terugvalReden: null } : { rijen: terugvalBronnen(), uitTabel: false, terugvalReden: "de tabel nv_bronnen is leeg" };
  } catch (e) {
    const reden = !opslag ? "geen opslag" : e instanceof Error && e.name === "TabelOntbreekt" ? "de tabel nv_bronnen bestaat nog niet" : "de tabel nv_bronnen kon niet worden gelezen";
    res = { rijen: terugvalBronnen(), uitTabel: false, terugvalReden: reden };
  }
  zetRadarDomeinen(radarDomeinenVan(res.rijen));
  return res;
}

/** Nieuwsbronnen die geoogst worden: ACTIVE, actief, en nooit een verboden domein (vaste lijst of radardomein). */
export const actieveNieuwsBronnen = (rijen: BronRij[]): Bron[] =>
  rijen.filter((r) => r.soort === "nieuws" && r.actief && r.status === "ACTIVE" && !isVerbodenBron(r.feed) && !isVerbodenBron(r.domein));

/** Melding in de stapdetails als de tabel wel bestaat maar geen enkele actieve nieuwsbron heeft. */
export const GEEN_ACTIEVE_BRONNEN_MELDING = "geen actieve nieuwsbronnen in de database, terugval gebruikt";

/**
 * De nieuwsbronnen die de motor oogst. Staat er niets actiefs in de tabel (alles uitgezet of weggehaald), dan valt hij terug op
 * data/bronnen.json, zodat de motor nooit stilvalt; `terugval` is dan true en de run noteert een fout.
 */
export function kiesOogstBronnen(lijst: Pick<BronnenLijst, "rijen" | "uitTabel">): { bronnen: Bron[]; terugval: boolean } {
  const bronnen = actieveNieuwsBronnen(lijst.rijen);
  if (bronnen.length || !lijst.uitTabel) return { bronnen, terugval: false };
  return { bronnen: actieveNieuwsBronnen(terugvalBronnen()), terugval: true };
}

/** Radarbronnen die gelezen worden. */
export const actieveRadarBronnen = (rijen: BronRij[]): BronRij[] => rijen.filter((r) => r.soort === "radar" && r.actief);

// ---- Kleur en soort voor het scherm --------------------------------------------------------------------
export type BronKleur = "groen" | "rood" | "grijs";
export const GEEN_ITEMS_DAGEN = 3;

/**
 * Groen: laatst gelezen en er kwamen items binnen 3 dagen. Rood: de laatste leesbeurt gaf een fout, of al 3 dagen geen items.
 * Grijs: concept, uitgeschakeld of nog nooit gelezen (net getest en toegevoegd).
 */
export function bronKleur(r: Pick<BronRij, "status" | "actief" | "laatstGelezen" | "laatstItems" | "laatsteFout" | "soort">, nu = Date.now()): BronKleur {
  if (!r.actief || (r.soort === "nieuws" && r.status !== "ACTIVE") || !r.laatstGelezen) return "grijs";
  if (r.laatsteFout) return "rood";
  const t = r.laatstItems ? Date.parse(r.laatstItems) : NaN;
  return Number.isFinite(t) && nu - t <= GEEN_ITEMS_DAGEN * 86400_000 ? "groen" : "rood";
}

export type BronSoortLabel = "overheid" | "pers" | "NL-BE";
export const BRON_SOORT_LABELS: BronSoortLabel[] = ["overheid", "pers", "NL-BE"];
/** Wat een redacteur ziet bij de stip: nooit een technische fout, wel wat er aan de hand is in gewone taal. */
export function statusTekst(r: Pick<BronRij, "actief" | "status" | "soort" | "laatsteFout">, kleur: BronKleur): string {
  if (kleur === "groen") return "Leest goed";
  if (kleur === "rood") return r.laatsteFout ? "Lukt even niet om te lezen" : "Al 3 dagen niets binnengekomen";
  if (!r.actief) return "Staat uit";
  if (r.soort === "nieuws" && r.status !== "ACTIVE") return "Nog niet in gebruik";
  return "Nieuw, wordt getest";
}

/** Wat de redactie leest bij een soort (de waarde zelf blijft overheid, pers of NL-BE). */
export const BRON_SOORT_TEKST: Record<BronSoortLabel, string> = { overheid: "overheid", pers: "krant of omroep", "NL-BE": "Nederland of België" };
export const bronSoortLabel = (r: Pick<BronRij, "regime" | "groep">): BronSoortLabel => (r.regime === "overheid" ? "overheid" : r.groep === "nl_vl_pers" ? "NL-BE" : "pers");

/** Zet een soortkeuze om in regime, groep en Frankrijk-filter (bij overheid geen filter; NL-BE en buitenland wel). */
export function soortVelden(label: BronSoortLabel, huidige: Pick<BronRij, "taal" | "land">): { regime: Regime; groep: Groep; frankrijkFilter: boolean; taal: string; land: string } {
  if (label === "overheid") return { regime: "overheid", groep: "overheid", frankrijkFilter: false, taal: huidige.taal, land: huidige.land };
  if (label === "NL-BE") return { regime: "pers", groep: "nl_vl_pers", frankrijkFilter: true, taal: "nl", land: huidige.land === "BE" ? "BE" : "NL" };
  return { regime: "pers", groep: huidige.land === "FR" ? "fr_pers" : "buitenlandse_pers", frankrijkFilter: huidige.land !== "FR", taal: huidige.taal, land: huidige.land };
}
