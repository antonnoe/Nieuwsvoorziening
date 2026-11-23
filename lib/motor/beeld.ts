// Beeld per bericht: alleen het veld beeld_url en een pluggable generator.
// Standaard UIT: BEELD_GENERATOR leeg betekent geen beeld. Er is bewust geen
// beeldbron gekozen (openstaand besluit) en nooit een persfoto.
import type { Bericht } from "./types";

export interface BeeldGenerator {
  naam: string;
  /** Geeft een publieke URL terug, of null als er geen beeld komt. */
  genereer(bericht: Pick<Bericht, "kop" | "samenvatting" | "categorie">): Promise<string | null>;
}

const register = new Map<string, BeeldGenerator>();

export function registreerGenerator(g: BeeldGenerator) {
  register.set(g.naam, g);
}

export function actieveGenerator(): BeeldGenerator | null {
  const naam = String(process.env.BEELD_GENERATOR || "").trim();
  return naam ? register.get(naam) || null : null;
}

/** Faalt nooit: bij een storing of zonder generator is het resultaat null. */
export async function beeldVoor(b: Pick<Bericht, "kop" | "samenvatting" | "categorie">, g: BeeldGenerator | null = actieveGenerator()): Promise<string | null> {
  if (!g) return null;
  try {
    const u = await g.genereer(b);
    return u && /^https:\/\//.test(u) ? u : null;
  } catch {
    return null;
  }
}
