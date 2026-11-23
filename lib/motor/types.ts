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
}

export interface Cluster {
  sleutel: string;
  items: BronItem[];
}

export interface Synthese {
  kop: string;
  samenvatting: string;
  tekst: string;
  categorie: Categorie;
  relevantie: number; // 0..100, oordeel van het model voor de lezer
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
  aangekondigd?: { omschrijving?: string } | null;
}

export interface PeilKoppeling {
  raakt: { id: string; naam: string; bronUrl?: string | null; tools?: { naam: string; url: string | null }[] }[];
  mogelijkGewijzigd: { id: string; naam: string; toelichting: string }[];
}

export interface Bericht {
  id?: string;
  kop: string;
  samenvatting: string;
  tekst: string;
  categorie: Categorie;
  score: number;
  regime: Regime;
  status: "gepubliceerd" | "geblokkeerd" | "concept";
  blokkadeRedenen: string[];
  beeldUrl: string | null;
  peil: PeilKoppeling;
  bronnen: BerichtBron[];
  gepubliceerdOp: string;
  sleutel: string;
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
