// Gedeelde hulpjes voor de API-routes: CORS, JSON, opslag, gepubliceerde vorm.
import { corsToegestaan } from "./config";
import { maakOpslag, type Opslag, type OpgeslagenBericht } from "./opslag";
import { CATEGORIEEN } from "./types";

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

export function geenOpslag(req: Request): Response {
  return jsonAntwoord(req, { fout: "De opslag is niet beschikbaar." }, 503);
}

export function geldigeCategorie(c: string | null): string | undefined {
  if (!c) return undefined;
  const n = c.trim().toLowerCase().replace(/-/g, " ");
  return (CATEGORIEEN as readonly string[]).includes(n) ? n : undefined;
}

export function publiekBericht(b: OpgeslagenBericht, metTekst: boolean, wordtNagelopen: string[] = []) {
  return {
    id: b.id,
    kop: b.kop,
    samenvatting: b.samenvatting,
    ...(metTekst ? { tekst: b.tekst } : {}),
    categorie: b.categorie,
    gepubliceerdOp: b.gepubliceerdOp,
    beeldUrl: b.beeldUrl,
    beeldCredit: b.beeldCredit ?? null,
    bronnen: b.bronnen,
    peil: {
      raakt: b.peil.raakt.map((p) => ({ ...p, wordtNagelopen: wordtNagelopen.includes(p.id) || b.peil.mogelijkGewijzigd.some((g) => g.id === p.id) })),
    },
  };
}
