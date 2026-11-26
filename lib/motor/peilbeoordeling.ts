// PEIL streng (besluit 26-11-2026): twee onafhankelijke controles per kandidaat-koppeling en de
// zekerheid die daaruit volgt. Alleen "groen" (beide zeggen ja, letterlijk citaat, waarde en datum
// gelijk, geen datum in het verleden, definitief) wordt aan lezers getoond. Zuivere functies, getest.
import { kernwoorden, normaliseer, hashId } from "./tekst";

export interface Controle {
  raakt: boolean;
  soort: "wijziging" | "alleen_raakt";
  nieuweWaarde: string | null;
  ingangsdatum: string | null;
  definitief: boolean | null;
  citaat: string;
  titel: string;
}

const tekstOfNull = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return t && !/^(null|geen|onbekend|n\/a)$/i.test(t) ? t.slice(0, 240) : null;
};

/** Leest het JSON-antwoord van één controle. `sleutel` is "raakt" of "ontbreekt". Alleen een echte `true` telt als ja. */
export function leesControle(j: unknown, sleutel: "raakt" | "ontbreekt" = "raakt"): Controle | null {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  if (typeof o[sleutel] !== "boolean") return null;
  return {
    raakt: o[sleutel] === true,
    soort: o.soort === "wijziging" ? "wijziging" : "alleen_raakt",
    nieuweWaarde: tekstOfNull(o.nieuweWaarde),
    ingangsdatum: tekstOfNull(o.ingangsdatum),
    definitief: typeof o.definitief === "boolean" ? o.definitief : null,
    citaat: typeof o.citaat === "string" ? o.citaat.trim().slice(0, 400) : "",
    titel: (tekstOfNull(o.titel) || "").slice(0, 120),
  };
}

const platte = (t: string) => normaliseer(t).replace(/[^a-z0-9]+/g, " ").trim();

/** Staat het citaat letterlijk (genormaliseerd: zonder hoofdletters, accenten en leestekens) in de tekst? Weglatingstekens splitsen het citaat. */
export function citaatAanwezig(citaat: string, tekst: string): boolean {
  const delen = String(citaat || "").split(/…|\.\.\./).map(platte).filter(Boolean);
  if (!delen.length) return false;
  const woorden = delen.reduce((n, d) => n + d.split(" ").length, 0);
  if (woorden < 3) return false;
  const h = ` ${platte(tekst)} `;
  return delen.every((d) => h.includes(` ${d} `));
}

/** Staat de ingangsdatum vóór de publicatiedatum? null = onleesbaar. Accepteert JJJJ-MM-DD, JJJJ-MM en JJJJ. */
export function datumInVerleden(datum: string, publicatieIso: string): boolean | null {
  const m = String(datum).trim().match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  const p = String(publicatieIso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || !p) return null;
  const [y, mo, d] = [Number(m[1]), m[2] ? Number(m[2]) : 0, m[3] ? Number(m[3]) : 0];
  if ((mo && (mo < 1 || mo > 12)) || (d && (d < 1 || d > 31))) return null;
  const [py, pm, pd] = [Number(p[1]), Number(p[2]), Number(p[3])];
  if (y !== py) return y < py;
  if (!mo) return false;
  if (mo !== pm) return mo < pm;
  if (!d) return false;
  return d < pd;
}

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
export function datumNl(datum: string): string {
  const m = String(datum).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!m) return datum;
  return [m[3] ? String(Number(m[3])) : "", m[2] ? MAANDEN[Number(m[2]) - 1] || "" : "", m[1]].filter(Boolean).join(" ");
}

function getallen(t: string): string[] {
  return (String(t).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(",", ".").replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"));
}
/** Noemen beide controles dezelfde nieuwe waarde? Getallen moeten gelijk zijn; zonder getallen volstaat gelijke tekst. */
export function waardenGelijk(a: string, b: string): boolean {
  const ga = getallen(a), gb = getallen(b);
  if (ga.length || gb.length) return ga.length === gb.length && [...ga].sort().join("|") === [...gb].sort().join("|");
  return platte(a) === platte(b) || platte(a).includes(platte(b)) || platte(b).includes(platte(a));
}

export interface Beoordeling {
  zekerheid: "groen" | "oranje";
  soort: "wijziging" | "alleen_raakt";
  /** Eén zin gewone taal; null bij groen. */
  twijfel: string | null;
  problemen: string[];
}

/**
 * Combineert twee controles (a: goedkoop model, b: synthesemodel). null als niet allebei "ja" zeggen: dan
 * geen koppeling en geen signaal. Daarna "groen" of "oranje".
 */
export function beoordeel(a: Controle, b: Controle, ctx: { tekst: string; publicatie: string; ontbreekt?: boolean }): Beoordeling | null {
  if (!a.raakt || !b.raakt) return null;
  const problemen: string[] = [];
  const soort: Beoordeling["soort"] = ctx.ontbreekt || a.soort === "wijziging" || b.soort === "wijziging" ? "wijziging" : "alleen_raakt";
  if (!ctx.ontbreekt && a.soort !== b.soort) problemen.push("De twee controles zijn het er niet over eens of het om een wijziging gaat.");
  if (!citaatAanwezig(a.citaat, ctx.tekst) || !citaatAanwezig(b.citaat, ctx.tekst)) problemen.push("Het aangehaalde stuk staat niet letterlijk in het bericht.");
  if (soort === "wijziging") {
    if (!ctx.ontbreekt) {
      if (!a.nieuweWaarde || !b.nieuweWaarde) problemen.push("Er wordt geen nieuwe waarde genoemd.");
      else if (!waardenGelijk(a.nieuweWaarde, b.nieuweWaarde)) problemen.push("De twee controles noemen niet dezelfde nieuwe waarde.");
    }
    if (a.ingangsdatum !== b.ingangsdatum) problemen.push("De twee controles noemen niet dezelfde ingangsdatum.");
    for (const d of new Set([a.ingangsdatum, b.ingangsdatum])) {
      if (!d) continue;
      const v = datumInVerleden(d, ctx.publicatie);
      if (v === true) problemen.push(`De genoemde datum (${datumNl(d)}) ligt al in het verleden.`);
      else if (v === null) problemen.push(`De genoemde datum (${d}) is niet goed te lezen.`);
    }
  }
  if (a.definitief === false || b.definitief === false || (soort === "wijziging" && !ctx.ontbreekt && (a.definitief === null || b.definitief === null))) problemen.push("Het is nog niet zeker dat dit definitief is.");
  const uniek = [...new Set(problemen)];
  return { zekerheid: uniek.length ? "oranje" : "groen", soort, twijfel: uniek.length ? uniek.join(" ") : null, problemen: uniek };
}

/** Sleutel van een "ontbreekt"-onderwerp: de kernwoorden van de titel, gesorteerd. */
export const ontbreektSleutel = (titel: string) => `ontbreekt:${hashId([...new Set(kernwoorden(titel))].sort().join(" "))}`;

/** Zoekt een bestaand "ontbreekt"-signaal over hetzelfde onderwerp (zelfde sleutel, of titels die sterk overlappen). */
export function zoekSamenvoeging<T extends { titel?: string | null; parameterId?: string }>(titel: string, sleutel: string, bestaande: T[]): T | null {
  const mijn = new Set(kernwoorden(titel));
  for (const b of bestaande) {
    if (b.parameterId === sleutel) return b;
    const hun = new Set(kernwoorden(b.titel || ""));
    if (!mijn.size || !hun.size) continue;
    let g = 0;
    for (const w of mijn) if (hun.has(w)) g += 1;
    if (g >= 2 && g / Math.min(mijn.size, hun.size) >= 0.6) return b;
  }
  return null;
}
