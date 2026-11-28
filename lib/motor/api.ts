// Gedeelde hulpjes voor de API-routes: CORS, JSON, opslag, gepubliceerde vorm.
import { corsToegestaan } from "./config";
import { maakOpslag, soortVan, type Opslag, type OpgeslagenBericht } from "./opslag";
import { CATEGORIEEN, KANALEN, groenePeil, leesKanalen, leesSignaal, type Kanaal } from "./types";

export function corsHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = { vary: "origin" };
  const o = corsToegestaan(req.headers.get("origin"));
  if (o) {
    h["access-control-allow-origin"] = o;
    h["access-control-allow-methods"] = "GET, OPTIONS";
    h["access-control-allow-headers"] = "content-type";
  }
  return h;
}

export function jsonAntwoord(req: Request, data: unknown, status = 200, cacheSeconden = 60): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 && cacheSeconden > 0 ? `public, s-maxage=${cacheSeconden}, stale-while-revalidate=300` : "no-store",
      ...corsHeaders(req),
    },
  });
}

export function opties(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

let opslagCache: Opslag | null | undefined;
export function leesOpslag(): Opslag | null {
  if (opslagCache === undefined) opslagCache = maakOpslag();
  return opslagCache;
}

/** Alleen voor tests: vergeet de gecachte opslag, zodat een nieuwe omgeving of fetch wordt opgepakt. */
export function wisOpslagCache() {
  opslagCache = undefined;
}

export function geenOpslag(req: Request): Response {
  return jsonAntwoord(req, { fout: "De opslag is niet beschikbaar." }, 503);
}

export function geldigeCategorie(c: string | null): string | undefined {
  if (!c) return undefined;
  const n = c.trim().toLowerCase().replace(/-/g, " ");
  return (CATEGORIEEN as readonly string[]).includes(n) ? n : undefined;
}

export function geldigKanaal(k: string | null): Kanaal | undefined {
  const n = String(k || "").trim().toLowerCase();
  return (KANALEN as readonly string[]).includes(n) ? (n as Kanaal) : undefined;
}

/** Domein van de eerste bron (zonder www), voor overheidsberichten. */
export function bronDomein(b: Pick<OpgeslagenBericht, "bronnen">): string | null {
  try {
    return b.bronnen[0] ? new URL(b.bronnen[0].url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

export function publiekBericht(b: OpgeslagenBericht, metTekst: boolean, wordtNagelopen: string[] = []) {
  return {
    id: b.id,
    kop: b.kop,
    samenvatting: b.samenvatting,
    ...(metTekst ? { tekst: b.tekst } : {}),
    categorie: b.categorie,
    portemonnee: b.portemonnee === true,
    gepubliceerdOp: b.gepubliceerdOp,
    beeldUrl: b.beeldUrl,
    beeldCredit: b.beeldCredit ?? null,
    bronnen: b.bronnen,
    peil: {
      raakt: groenePeil(b.peil.raakt).map(({ zekerheid: _z, ...p }) => ({ ...p, wordtNagelopen: wordtNagelopen.includes(p.id) || b.peil.mogelijkGewijzigd.some((g) => g.id === p.id) })),
    },
    // Toegevoegd 26-11-2026 (keuze A): alleen toevoegen, de velden hierboven zijn ongewijzigd.
    soort: soortVan(b),
    domein: soortVan(b) === "overheid" ? bronDomein(b) : null,
    kanalen: leesKanalen(b.kanalen),
    // Toegevoegd 27-11-2026 (InfoPoche "Let op"): alleen toevoegen, achteraan. Geen interne toelichting.
    signaal: leesSignaal(b.signaal),
    // Toegevoegd 28-11-2026: PNG-url van een eigen illustratie (e-mail toont geen SVG); anders null.
    beeldPng: b.beeldCredit?.bron === "Illustratie" && b.beeldCredit.png ? b.beeldCredit.png : null,
  };
}
