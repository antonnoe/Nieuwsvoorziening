// Beeld per bericht. Sinds 23-11-2026 is Unsplash de standaardbron (zie
// beeld-unsplash.ts), met verplichte naamsvermelding van de fotograaf.
// BEELD_GENERATOR kiest expliciet een generator; leeg = Unsplash als
// UNSPLASH_ACCESS_KEY bestaat, anders geen beeld. Nooit een persfoto.
import type { Bericht, BeeldCredit } from "./types";
import type { ModelClient } from "./ai";

export interface BeeldResultaat {
  url: string;
  credit?: BeeldCredit | null;
}

export type BeeldInvoer = Pick<Bericht, "kop" | "samenvatting" | "categorie"> & {
  /** Zoektermen van specifiek naar algemeen (Engels, plek of situatie). */
  zoektermen?: string[];
  /** Oude enkelvoudige zoekterm; wordt achter de lijst gezet. */
  zoekterm?: string;
  /** Goedkoop model voor de pasvorm-keuze. Zonder client geen Unsplash-zoekfoto, alleen de terugval. */
  client?: ModelClient | null;
  /** Al gebruikte foto's (zie `fotoSleutel`); een foto uit deze set wordt nooit nog eens gekozen. De generator voegt de gekozen foto zelf toe. */
  vermijd?: Set<string>;
};

/** Sleutel van een foto-url: host en pad (het foto-id zit in het pad), zonder queryparameters, zodat een lichtere of oudere url van dezelfde foto herkend wordt. */
export function fotoSleutel(u: string): string {
  try {
    const x = new URL(u);
    return `${x.host}${x.pathname}`;
  } catch {
    return String(u || "").split("?")[0];
  }
}

export interface BeeldGenerator {
  naam: string;
  /** Optioneel: begin van een run (zet het aanvraagbudget terug). */
  startRun?(): void;
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

const PERSOON_WOORDEN = new Set([
  "person", "people", "man", "men", "woman", "women", "boy", "girl", "child", "children", "kid", "kids", "portrait", "selfie", "face", "crowd",
  "couple", "family", "politician", "minister", "president", "mayor", "police", "officer", "soldier", "protester", "protesters", "worker", "workers",
  "tourist", "tourists", "player", "athlete", "singer", "actor", "actress", "doctor", "nurse", "driver", "pilot", "farmer",
]);
const TOEGESTANE_HOOFDLETTERS = new Set(["france", "french", "paris", "europe", "european", "alps", "alpine", "normandy", "brittany", "provence", "corsica", "riviera"]);

/** True als een (Engelse) omschrijving een persoon noemt; zulke foto's gebruiken we nooit. */
export function noemtPersoon(tekst: string): boolean {
  return String(tekst || "").toLowerCase().split(/[^a-z]+/).some((w) => PERSOON_WOORDEN.has(w));
}

/** Schoont zoektermen: alleen letters, geen persoonswoorden, geen eigennamen (hoofdletterwoorden buiten een korte lijst), 2 tot 5 woorden, hooguit 3, ontdubbeld. */
export function schoneZoektermen(ruw: unknown): string[] {
  const lijst = Array.isArray(ruw) ? ruw : typeof ruw === "string" ? [ruw] : [];
  const uit: string[] = [];
  for (const t of lijst) {
    const woorden = String(t || "").replace(/[^A-Za-z ]+/g, " ").split(/\s+/).filter(Boolean)
      .filter((w) => !/^[A-Z]/.test(w) || TOEGESTANE_HOOFDLETTERS.has(w.toLowerCase()))
      .map((w) => w.toLowerCase());
    if (woorden.length < 2 || woorden.length > 5 || woorden.some((w) => PERSOON_WOORDEN.has(w))) continue;
    const term = woorden.join(" ").slice(0, 60);
    if (!uit.includes(term)) uit.push(term);
    if (uit.length >= 3) break;
  }
  return uit;
}
