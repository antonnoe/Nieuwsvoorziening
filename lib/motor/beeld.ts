// Beeld per bericht. Sinds 23-11-2026 is Unsplash de standaardbron (zie
// beeld-unsplash.ts), met verplichte naamsvermelding van de fotograaf.
// BEELD_GENERATOR kiest expliciet een generator; leeg = Unsplash als
// UNSPLASH_ACCESS_KEY bestaat, anders geen beeld. Nooit een persfoto.
import type { Bericht, BeeldCredit } from "./types";

export interface BeeldResultaat {
  url: string;
  credit?: BeeldCredit | null;
}

export type BeeldInvoer = Pick<Bericht, "kop" | "samenvatting" | "categorie"> & { zoekterm?: string };

export interface BeeldGenerator {
  naam: string;
  /** Geeft een publieke URL (of URL met bronvermelding) terug, of null als er geen beeld komt. */
  genereer(bericht: BeeldInvoer): Promise<string | BeeldResultaat | null>;
}

const register = new Map<string, BeeldGenerator>();

export function registreerGenerator(g: BeeldGenerator) {
  register.set(g.naam, g);
}

export function actieveGenerator(): BeeldGenerator | null {
  const gekozen = String(process.env.BEELD_GENERATOR || "").trim();
  const naam = gekozen || (String(process.env.UNSPLASH_ACCESS_KEY || "").trim() ? "unsplash" : "");
  if (!naam || naam === "uit") return null;
  return register.get(naam) || null;
}

/** Faalt nooit: bij een storing of zonder generator is het resultaat null. */
export async function beeldResultaat(b: BeeldInvoer, g: BeeldGenerator | null = actieveGenerator()): Promise<BeeldResultaat | null> {
  if (!g) return null;
  try {
    const u = await g.genereer(b);
    const r = typeof u === "string" ? { url: u } : u;
    return r && /^https:\/\//.test(r.url) ? r : null;
  } catch {
    return null;
  }
}

/** Alleen de URL (oude aanroep, blijft voor tests en eenvoudige generatoren). */
export async function beeldVoor(b: BeeldInvoer, g: BeeldGenerator | null = actieveGenerator()): Promise<string | null> {
  return (await beeldResultaat(b, g))?.url ?? null;
}
