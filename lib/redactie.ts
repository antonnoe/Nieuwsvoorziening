// Redactiebesluit (besluit opdrachtgever 26-11-2026): één redactietool in nlfr-menu (/redactie) stuurt deze
// motor aan via POST en GET /api/redactie, achter Authorization: Bearer <CRON_SECRET>. Zonder CRON_SECRET is
// alles dicht. Sleutels komen nooit in logs of antwoorden.
import { bearerGeldig, geheim } from "@/lib/beheer";
import { bronDomein } from "@/lib/motor/api";
import { soortVan, type OpgeslagenBericht } from "@/lib/motor/opslag";
import { CATEGORIEEN, KANALEN, leesKanalen, type Bericht, type Kanaal } from "@/lib/motor/types";
import { laadConfig } from "@/lib/motor/config";

export const REDACTIE_ORIGIN = "https://nlfr-menu.vercel.app";

export function redactieCors(req: Request): Record<string, string> {
  const h: Record<string, string> = { vary: "origin" };
  if (req.headers.get("origin") === REDACTIE_ORIGIN) {
    h["access-control-allow-origin"] = REDACTIE_ORIGIN;
    h["access-control-allow-methods"] = "GET, POST, OPTIONS";
    h["access-control-allow-headers"] = "authorization, content-type";
    h["access-control-max-age"] = "600";
  }
  return h;
}

export function redactieAntwoord(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...redactieCors(req) },
  });
}

// Rem in het geheugen van deze instantie: hooguit 5 foute pogingen per 10 minuten per afzender (zoals /beheer).
const pogingen = new Map<string, number[]>();
export function wisRem() {
  pogingen.clear();
}

export type Toegang = "ok" | "dicht" | "geweigerd" | "te-vaak";

/** Controleert de Bearer-sleutel en houdt foute pogingen bij. */
export function controleerToegang(req: Request, nu = Date.now()): Toegang {
  if (!geheim()) return "dicht";
  const wie = (req.headers.get("x-forwarded-for") || "onbekend").split(",")[0].trim();
  const recent = (pogingen.get(wie) || []).filter((t) => nu - t < 600_000);
  if (recent.length >= 5) return "te-vaak";
  if (!bearerGeldig(req.headers.get("authorization"))) {
    pogingen.set(wie, [...recent, nu]);
    return "geweigerd";
  }
  pogingen.delete(wie);
  return "ok";
}

export function toegangFout(req: Request, t: Exclude<Toegang, "ok">): Response {
  const [status, fout] = t === "dicht" ? [503, "Redactie is dicht."] : t === "te-vaak" ? [429, "Te veel pogingen."] : [401, "Niet toegestaan."];
  return redactieAntwoord(req, { fout }, status);
}

/** Een reden uit de poort is elke reden zonder het voorvoegsel "herschrijven:" (die komt van de relevantiecontrole bij herschrijven). */
export const isPoortReden = (r: string) => !r.startsWith("herschrijven:");
/** Blokkeert de kwaliteitspoort dit bericht? Geblokkeerd, of een concept met een poortreden. */
export const poortBlokkade = (b: Pick<OpgeslagenBericht, "status" | "blokkadeRedenen">) => b.status === "geblokkeerd" || b.blokkadeRedenen.some(isPoortReden);

/** Waarom staat een bericht niet geplaatst? Gewone taal; null als het geplaatst is. */
export function nietGeplaatstReden(b: OpgeslagenBericht): string | null {
  if (b.status === "gepubliceerd") return null;
  const redenen = b.blokkadeRedenen;
  if (poortBlokkade(b)) return `Kwaliteitspoort: ${redenen.filter(isPoortReden).join("; ") || "geblokkeerd"}.`;
  const c = laadConfig();
  if (redenen.length) return `${redenen.join("; ")}.`;
  return `Score ${b.score} of relevantie onder de drempel (plaatsen vanaf score ${c.publiceerDrempel} en relevantie ${c.minRelevantie}).`;
}

/** Eén zin in gewone taal voor een niet-technische beheerder, zonder getallen of drempels; null als het bericht geplaatst is. */
export function redenTekst(b: OpgeslagenBericht): string | null {
  if (b.status === "gepubliceerd") return null;
  const r = b.blokkadeRedenen.join(" | ").toLowerCase();
  if (r.includes("krantennaam")) return "De tekst noemt een krant.";
  if (r.includes("letterlijk overgenomen")) return "De tekst lijkt te veel op het origineel.";
  if (r.includes("te kort of leeg")) return "De tekst is te kort.";
  if (r.includes("praat over invoer")) return "De tekst praat over zijn eigen bronnen.";
  if (r.includes("relevantie") && r.includes("onder")) return "Te weinig van belang voor onze lezers.";
  if (!b.blokkadeRedenen.length) {
    const c = laadConfig();
    const min = b.regime === "overheid" ? c.minBronnenOverheid : c.minBronnenPers;
    if (b.bronnen.length > 0 && b.bronnen.length < min) return "Maar één bron gevonden.";
    if (b.status === "concept") return "Te weinig van belang voor onze lezers.";
  }
  return "Niet geplaatst door de controle.";
}

/** De vorm voor de redactietool: alles wat nodig is om een lijst te maken, zonder volledige tekst. */
export function redactieVorm(b: OpgeslagenBericht) {
  const reden = nietGeplaatstReden(b);
  return {
    geplaatst: b.status === "gepubliceerd",
    reden,
    redenTekst: redenTekst(b),
    kanPlaatsen: b.status === "concept" && !poortBlokkade(b) && b.redactie !== "weg",
    handmatigOp: b.handmatigOp ?? null,
    herschrijfGemarkeerd: b.regelversie === 0,
    id: b.id,
    kop: b.kop,
    samenvatting: b.samenvatting,
    categorie: b.categorie,
    status: b.status,
    score: b.score,
    soort: soortVan(b),
    domein: soortVan(b) === "overheid" ? bronDomein(b) : null,
    kanalen: leesKanalen(b.kanalen),
    redactie: b.redactie === "weg" ? "weg" : null,
    redactieOp: b.redactieOp ?? null,
    portemonnee: b.portemonnee === true,
    blokkadeRedenen: b.blokkadeRedenen,
    gepubliceerdOp: b.gepubliceerdOp,
    beeldUrl: b.beeldUrl,
    bronnen: b.bronnen,
  };
}

export interface RedactieOpdracht {
  id: string;
  actie: "weg" | "terug" | "kanaal" | "plaats" | "herschrijf" | "bewerk";
  kanaal?: Kanaal;
  aan?: boolean;
  bewerk?: { kop?: string; samenvatting?: string; tekst?: string; categorie?: Bericht["categorie"] };
}

const ACTIES = ["weg", "terug", "kanaal", "plaats", "herschrijf", "bewerk"];

/** Leest en valideert de body. Geeft de opdracht of een foutmelding. */
export function leesOpdracht(body: unknown): { opdracht: RedactieOpdracht } | { fout: string } {
  if (!body || typeof body !== "object") return { fout: "Body moet een JSON-object zijn." };
  const b = body as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id || id.length > 80 || !/^[A-Za-z0-9-]+$/.test(id)) return { fout: "Ongeldig id." };
  if (typeof b.actie !== "string" || !ACTIES.includes(b.actie)) return { fout: `Actie moet een van ${ACTIES.join(", ")} zijn.` };
  if (b.actie === "bewerk") {
    const v: NonNullable<RedactieOpdracht["bewerk"]> = {};
    const tekstveld = (naam: "kop" | "samenvatting" | "tekst", min: number, max: number): string | null => {
      if (b[naam] === undefined) return null;
      const t = typeof b[naam] === "string" ? (b[naam] as string).trim() : "";
      if (t.length < min || t.length > max) return `${naam} moet tussen ${min} en ${max} tekens zijn.`;
      v[naam] = t;
      return null;
    };
    const f = tekstveld("kop", 5, 300) || tekstveld("samenvatting", 10, 1500) || tekstveld("tekst", 20, 20000);
    if (f) return { fout: f };
    if (b.categorie !== undefined) {
      if (typeof b.categorie !== "string" || !(CATEGORIEEN as readonly string[]).includes(b.categorie)) return { fout: `Categorie moet een van ${CATEGORIEEN.join(", ")} zijn.` };
      v.categorie = b.categorie as Bericht["categorie"];
    }
    if (!Object.keys(v).length) return { fout: "Geef minstens een van kop, samenvatting, tekst of categorie." };
    return { opdracht: { id, actie: "bewerk", bewerk: v } };
  }
  if (b.actie !== "kanaal") return { opdracht: { id, actie: b.actie as RedactieOpdracht["actie"] } };
  if (typeof b.kanaal !== "string" || !(KANALEN as readonly string[]).includes(b.kanaal)) return { fout: `Kanaal moet een van ${KANALEN.join(", ")} zijn.` };
  if (typeof b.aan !== "boolean") return { fout: 'Bij actie "kanaal" is "aan" (true of false) verplicht.' };
  return { opdracht: { id, actie: "kanaal", kanaal: b.kanaal as Kanaal, aan: b.aan } };
}
