// Redactiebesluit (besluit opdrachtgever 26-11-2026): één redactietool in nlfr-menu (/redactie) stuurt deze
// motor aan via POST en GET /api/redactie, achter Authorization: Bearer <REDACTIE_SECRET> (eigen sleutel, terugval CRON_SECRET). Zonder
// sleutel is alles dicht. Sleutels komen nooit in logs of antwoorden.
import { timingSafeEqual } from "node:crypto";
import { geheim } from "@/lib/beheer";
import { bronDomein } from "@/lib/motor/api";
import { soortVan, type OpgeslagenBericht, type Opslag } from "@/lib/motor/opslag";
import { CATEGORIEEN, KANALEN, PEIL_BESLUITEN, RADAR_BESLUITEN, leesKanalen, type Bericht, type Kanaal, type PeilBesluit, type PeilSignaalRij, type RadarBesluit } from "@/lib/motor/types";
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
/** Eigen sleutel voor de redactie (REDACTIE_SECRET, kleinste rechten: alleen deze route); valt terug op CRON_SECRET. */
export function redactieGeheim(): string | null {
  const r = process.env.REDACTIE_SECRET;
  return r && r.length > 0 ? r : geheim();
}
function redactieBearerGeldig(authorization: string | null | undefined): boolean {
  const g = redactieGeheim();
  if (!g) return false;
  const x = Buffer.from(authorization || ""), y = Buffer.from(`Bearer ${g}`);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function controleerToegang(req: Request, nu = Date.now()): Toegang {
  if (!redactieGeheim()) return "dicht";
  const wie = (req.headers.get("x-forwarded-for") || "onbekend").split(",")[0].trim();
  const recent = (pogingen.get(wie) || []).filter((t) => nu - t < 600_000);
  if (recent.length >= 5) return "te-vaak";
  if (!redactieBearerGeldig(req.headers.get("authorization"))) {
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

/** Een open PEIL-signaal voor de redactie: gewone taal, geen PEIL-ids. Advies: vastgesteld bij een definitieve wijziging, verwacht bij een voorlopige, lijst bij "ontbreekt in PEIL". */
export function peilVorm(x: PeilSignaalRij) {
  const advies: PeilBesluit = x.soort === "ontbreekt" ? "lijst" : x.definitief === true ? "vastgesteld" : "verwacht";
  return {
    id: x.id,
    soort: x.soort,
    zekerheid: x.zekerheid,
    titel: x.titel,
    huidige: x.huidigeWaarde,
    nieuw: x.nieuweWaarde,
    vanaf: x.vanaf,
    twijfel: x.twijfel,
    berichtId: x.berichtId,
    berichtKop: x.berichtKop,
    bronUrl: x.bronUrl,
    aantal: x.aantal,
    advies: advies as "vastgesteld" | "verwacht" | "lijst",
  };
}

/** Het besluit over een radarsignaal uitvoeren (gedeeld door /api/redactie en de redactie-app). */
export async function radarBesluitUitvoeren(opslag: Opslag, id: string, keuze: RadarBesluit): Promise<{ ok: true } | { ok: false; status: 404 | 409; fout: string }> {
  const rij = await opslag.radarRij(id);
  if (!rij) return { ok: false, status: 404, fout: "Radarsignaal niet gevonden." };
  if (rij.besluit) return { ok: false, status: 409, fout: `Dit radarsignaal is al afgehandeld (${rij.besluit}).` };
  await opslag.zetRadarBesluit(id, keuze);
  return { ok: true };
}

export interface RedactieOpdracht {
  id: string;
  actie: "weg" | "terug" | "kanaal" | "plaats" | "herschrijf" | "bewerk" | "peil" | "radar";
  /** Alleen bij actie "peil": het besluit over het signaal (id is dan het signaal-id). */
  keuze?: PeilBesluit;
  /** Alleen bij actie "radar": het besluit over het radarsignaal (id is dan het radar-id). */
  radarKeuze?: RadarBesluit;
  kanaal?: Kanaal;
  aan?: boolean;
  bewerk?: { kop?: string; samenvatting?: string; tekst?: string; categorie?: Bericht["categorie"] };
}

const ACTIES = ["weg", "terug", "kanaal", "plaats", "herschrijf", "bewerk", "peil", "radar"];

/** Leest en valideert de body. Geeft de opdracht of een foutmelding. */
export function leesOpdracht(body: unknown): { opdracht: RedactieOpdracht } | { fout: string } {
  if (!body || typeof body !== "object") return { fout: "Body moet een JSON-object zijn." };
  const b = body as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id || id.length > 80 || !/^[A-Za-z0-9-]+$/.test(id)) return { fout: "Ongeldig id." };
  if (typeof b.actie !== "string" || !ACTIES.includes(b.actie)) return { fout: `Actie moet een van ${ACTIES.join(", ")} zijn.` };
  if (b.actie === "peil") {
    if (typeof b.keuze !== "string" || !(PEIL_BESLUITEN as readonly string[]).includes(b.keuze)) return { fout: `Keuze moet een van ${PEIL_BESLUITEN.join(", ")} zijn.` };
    return { opdracht: { id, actie: "peil", keuze: b.keuze as PeilBesluit } };
  }
  if (b.actie === "radar") {
    if (typeof b.keuze !== "string" || !(RADAR_BESLUITEN as readonly string[]).includes(b.keuze)) return { fout: `Keuze moet een van ${RADAR_BESLUITEN.join(", ")} zijn.` };
    return { opdracht: { id, actie: "radar", radarKeuze: b.keuze as RadarBesluit } };
  }
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
