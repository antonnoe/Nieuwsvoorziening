// Gedeelde hulpjes voor de routes van de redactie-app: toegang, herkomstcontrole en antwoorden. Alles no-store en noindex.
import { leesOpslag } from "@/lib/motor/api";
import type { Opslag } from "@/lib/motor/opslag";
import { TIJDELIJK_MELDING, logReden } from "@/lib/redactie-melding";
import { bepaalToegang, leesCookie, type Toegang } from "@/lib/redactie-toegang";

const KOPPEN = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };

export const jsonUit = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...KOPPEN, ...extra } });

export const doorsturen = (pad: string, extra: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: pad, ...KOPPEN, ...extra } });

/** Bij een POST met een Origin-kop moet die van onze eigen host zijn (aanvulling op SameSite=Strict). */
export function zelfdeHerkomst(req: Request): boolean {
  const o = req.headers.get("origin");
  if (!o) return true;
  try {
    return new URL(o).host === (req.headers.get("host") || new URL(req.url).host);
  } catch {
    return false;
  }
}

/** Wie doet dit verzoek? Null = dicht (geen of ongeldig cookie, ingetrokken, geen geheim en geen tabel). */
export async function toegangVoor(req: Request, opslag: Opslag | null = leesOpslag()): Promise<Toegang | null> {
  return bepaalToegang(leesCookie(req.headers.get("cookie")), opslag);
}

/** Voor JSON-routes: antwoord of toegang. */
export async function eisJson(req: Request, o: { beheerder?: boolean } = {}): Promise<{ toegang: Toegang; opslag: Opslag } | { antwoord: Response }> {
  if (!zelfdeHerkomst(req)) return { antwoord: jsonUit({ fout: "Niet toegestaan." }, 403) };
  const opslag = leesOpslag();
  const toegang = await toegangVoor(req, opslag);
  if (!toegang) return { antwoord: jsonUit({ fout: "Niet ingelogd." }, 401) };
  if (o.beheerder && toegang.rol !== "beheerder") return { antwoord: jsonUit({ fout: "Alleen de beheerder kan dit." }, 403) };
  if (!opslag) {
    logReden("opslag", "geen opslag geconfigureerd");
    return { antwoord: jsonUit({ fout: TIJDELIJK_MELDING }, 503) };
  }
  return { toegang, opslag };
}
