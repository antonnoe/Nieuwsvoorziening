export const CATEGORIEEN = [
  "algemeen",
  "politiek",
  "economie en ondernemen",
  "reizen en verkeer",
  "natuur en rampen",
  "toerisme en evenementen",
  "merkwaardig",
] as const;
export type Categorie = (typeof CATEGORIEEN)[number];

export type Groep = "fr_pers" | "nl_vl_pers" | "buitenlandse_pers" | "overheid";
export type Regime = "pers" | "overheid";

export interface Bron {
  id: string;
  naam: string;
  feed: string;
  domein: string;
  taal: string;
  land: string;
  groep: Groep;
  regime: Regime;
  status: "ACTIVE" | "CONCEPT";
  prioriteit: number;
  frankrijkFilter: boolean;
  vensterUren: number;
  notitie?: string;
}

/** Een ruw item uit een feed. */
export interface BronItem {
  id?: string;
  url: string;
  bronId: string;
  bronNaam: string;
  regime: Regime;
  groep: Groep;
  taal: string;
  land: string;
  titel: string;
  samenvatting: string;
  gepubliceerdOp: string; // ISO
  opgehaaldOp?: string;
  prioriteit?: number;
  /** Alleen in het geheugen tijdens de synthese; wordt nooit opgeslagen. */
  artikelTekst?: string;
}

/** Kanalen waarop een bericht verschijnt; de redactietool (nlfr-menu /redactie) zet ze aan of uit per bericht. */
export const KANALEN = ["actueel", "nieuwsbrief", "infopoche", "zijbalk", "infofrankrijk"] as const;
export type Kanaal = (typeof KANALEN)[number];
export type Kanalen = Record<Kanaal, boolean>;
export const STANDAARD_KANALEN: Kanalen = { actueel: true, nieuwsbrief: true, infopoche: true, zijbalk: true, infofrankrijk: true };
export type Soort = "overheid" | "pers";

/** Leest een kanalenwaarde uit de opslag; ontbrekend of kapot geeft de standaard (alles aan). */
export function leesKanalen(v: unknown): Kanalen {
  const uit: Kanalen = { ...STANDAARD_KANALEN };
  if (v && typeof v === "object") for (const k of KANALEN) if (typeof (v as Record<string, unknown>)[k] === "boolean") uit[k] = (v as Record<string, boolean>)[k];
  return uit;
}

/** Signaal voor InfoPoche ("Let op"): wetswijziging of kans (besluit 27-11-2026). Alles anders is null. */
export const SIGNALEN = ["wetswijziging", "kans"] as const;
export type Signaal = (typeof SIGNALEN)[number];
/** Leest een signaalwaarde (model of opslag): precies "wetswijziging" of "kans", al het andere is null. */
export function leesSignaal(v: unknown): Signaal | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (SIGNALEN as readonly string[]).includes(s) ? (s as Signaal) : null;
}

export interface Cluster {
  sleutel: string;
  items: BronItem[];
}

export interface BeeldCredit {
  bron: string;
  maker: string;
  /** Alleen bij Unsplash. */
  makerUrl?: string;
  /** Alleen bij Unsplash. */
  bronUrl?: string;
  /** Alleen bij bron "Illustratie" (eigen illustratieset). */
  categorie?: string;
  naam?: string;
  /** Absolute PNG-url (voor e-mail, die geen SVG toont). */
  png?: string | null;
  /**
   * Alleen bij bron "Illustratie": hoe het beeld gekozen is. "model" (modelkeuze) en "trefwoord" (trefwoordscore) kan de motor later
   * herkiezen; "redactie" (uit de beeldbank gekozen) en "getekend" (voor dit bericht getekend, png is null) zijn handmatig en
   * blijven altijd staan. Ontbreekt bij oude berichten.
   */
  keuze?: "model" | "trefwoord" | "redactie" | "getekend";
}

export interface Synthese {
  kop: string;
  samenvatting: string;
  tekst: string;
  categorie: Categorie;
  relevantie: number; // 0..100, oordeel van het model voor de lezer
  /** Concreet financieel gevolg voor de lezer (prijzen, belasting, uitkering, premies, kosten). */
  portemonnee?: boolean;
  /** Wetswijziging of kans voor het blok "Let op" in InfoPoche; null of ontbrekend = geen signaal. */
  signaal?: Signaal | null;
  /** Engelse zoekterm voor een foto (2 tot 4 woorden, een plek of situatie, geen personen). */
  beeldZoekterm?: string;
  /** Tot 3 Engelse zoektermen van specifiek naar algemeen. */
  beeldZoektermen?: string[];
}

export interface PeilParameter {
  id: string;
  naam: string;
  naam_fr?: string;
  waarde_weergave?: string;
  trefwoorden?: string;
  land?: string;
  verificatiedatum?: string;
  bron_url?: string;
  tools?: { naam?: string; url?: string }[];
  aangekondigd?: { datum?: string | null; omschrijving?: string } | null;
}

export interface PeilKoppeling {
  /** Alleen koppelingen met zekerheid "groen" (twee onafhankelijke controles) horen hier; zonder zekerheid is een oude, ongetoetste koppeling. */
  raakt: { id: string; naam: string; bronUrl?: string | null; tools?: { naam: string; url: string | null }[]; zekerheid?: "groen" }[];
  mogelijkGewijzigd: { id: string; naam: string; toelichting: string }[];
}

/** Wat lezers mogen zien: alleen groene koppelingen (besluit 26-11-2026, PEIL streng). Oude koppelingen zonder zekerheid vallen af. */
export const groenePeil = <T extends { zekerheid?: string }>(raakt: T[] | undefined | null): T[] => (raakt || []).filter((r) => r.zekerheid === "groen");

export type PeilSoort = "wijziging" | "ontbreekt";
export type PeilZekerheid = "groen" | "oranje";
export type PeilBesluit = "vastgesteld" | "verwacht" | "raakt_niet" | "lijst" | "niet_nodig";
export const PEIL_BESLUITEN: readonly PeilBesluit[] = ["vastgesteld", "verwacht", "raakt_niet", "lijst", "niet_nodig"];

/** Een signaal voor de redactie (tabel nv_peil_signalen). */
export interface PeilSignaalIn {
  berichtId: string;
  /** Een PEIL-id (wijziging) of "ontbreekt:<sleutel>" (ontbreekt in PEIL). */
  parameterId: string;
  parameterNaam: string;
  toelichting: string;
  soort: PeilSoort;
  zekerheid: PeilZekerheid;
  /** Titel in gewone taal, zonder PEIL-ids. */
  titel: string;
  nieuweWaarde: string | null;
  huidigeWaarde: string | null;
  vanaf: string | null;
  definitief: boolean | null;
  /** Eén zin gewone taal: waarom is dit niet groen. */
  twijfel: string | null;
  citaat: string | null;
  bronUrl: string | null;
}
export type PeilSignaalNieuw = Omit<PeilSignaalIn, "berichtId">;
export interface PeilSignaalRij extends PeilSignaalIn {
  id: string;
  status: string;
  aantal: number;
  besluit: string | null;
  besluitOp: string | null;
  berichtKop: string;
}

export interface Bericht {
  id?: string;
  kop: string;
  samenvatting: string;
  tekst: string;
  categorie: Categorie;
  score: number;
  regime: Regime;
  /** Herkenbaar kenmerk in opslag en API: "overheid" of "pers" (ontbreekt = pers, of afgeleid van regime). */
  soort?: Soort;
  status: "gepubliceerd" | "geblokkeerd" | "concept";
  blokkadeRedenen: string[];
  beeldUrl: string | null;
  beeldCredit?: BeeldCredit | null;
  peil: PeilKoppeling;
  /** Raakt de portemonnee van de lezer (filter "€ Raakt uw portemonnee", naast de PEIL-koppeling). */
  portemonnee?: boolean;
  /** Signaal voor InfoPoche (null = geen). */
  signaal?: Signaal | null;
  /** Is het signaal beoordeeld (door de synthese of de nalooprun)? Onderscheidt "nog niet beoordeeld" van "beoordeeld: null". */
  signaalBeoordeeld?: boolean;
  bronnen: BerichtBron[];
  gepubliceerdOp: string;
  sleutel: string;
  /** Versie van de schrijfregels waarmee dit bericht is gemaakt (ontbreekt = 1). */
  regelversie?: number;
  /** Kanalen waarop het bericht staat (ontbreekt = alles aan). */
  kanalen?: Kanalen;
  /** Redactiebesluit: null of "weg" (dan verschijnt het nergens). */
  redactie?: "weg" | null;
  redactieOp?: string | null;
  /** Tijdstip van een handmatige correctie door de redactie: daarna schrijft de motor dit bericht nooit meer om of over. */
  handmatigOp?: string | null;
}

export interface BerichtBron {
  naam: string;
  origineleKop: string;
  datum: string;
  url: string;
}

export interface StapResultaat {
  stap: string;
  ok: boolean;
  aantal?: number;
  fout?: string;
  detail?: Record<string, unknown>;
}

// ---- Radar (besluit 28-11-2026): onderwerpsignalen, nooit bron ----------------------------------------
export const RADAR_CATEGORIEEN = ["Vastgoed", "Belastingen", "Zorg", "Verkeer", "Energie", "Consumentenrecht", "Overig"] as const;
export type RadarCategorie = (typeof RADAR_CATEGORIEEN)[number];
export const RADAR_STATUSSEN = ["klaar voor redactie", "handmatige broncheck vereist", "al gepubliceerd"] as const;
export type RadarStatus = (typeof RADAR_STATUSSEN)[number];
export const RADAR_BESLUITEN = ["geaccepteerd", "afgewezen"] as const;
export type RadarBesluit = (typeof RADAR_BESLUITEN)[number];
/** Een Franse overheidsbron bij een radarsignaal (nooit de signaalbron zelf). */
export interface RadarBron {
  naam: string;
  url: string;
  datum: string;
}
export interface RadarRij {
  id: string;
  signaalUrl: string;
  signaalDatum: string;
  werktitel: string;
  categorie: RadarCategorie;
  relevantie: string;
  status: RadarStatus;
  primaireBron: RadarBron[] | null;
  berichtId: string | null;
  beoordeeldOp: string;
  besluit: RadarBesluit | null;
  besluitOp: string | null;
}
export type RadarNieuw = Omit<RadarRij, "id" | "besluit" | "besluitOp">;
