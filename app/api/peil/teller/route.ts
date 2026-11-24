// Openbaar, alleen lezen: hoeveel PEIL-parameters deze maand en dit jaar zijn bijgewerkt
// (verificatiedatum). Een aanmaakdatum houdt PEIL niet bij, dus "toegevoegd" bestaat hier niet.
// Faalt PEIL: de laatst bekende stand (met verouderd:true), anders een nette 503.
import { corsHeaders, opties } from "@/lib/motor/api";
import { PEIL_URL } from "@/lib/motor/config";
import { telPeil, type PeilTeller } from "@/lib/peilteller";
import type { PeilParameter } from "@/lib/motor/types";

export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => opties(req);

let laatsteStand: PeilTeller | null = null;

async function haalPeil(): Promise<{ parameters: PeilParameter[]; stand: string | null }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(PEIL_URL, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("PEIL niet bereikbaar");
    const d = (await r.json()) as { parameters?: PeilParameter[]; stand?: string };
    const parameters = Array.isArray(d.parameters) ? d.parameters.filter((p) => p && p.id) : [];
    if (!parameters.length) throw new Error("PEIL leeg");
    return { parameters, stand: typeof d.stand === "string" ? d.stand : null };
  } finally {
    clearTimeout(t);
  }
}

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

function antwoord(req: Request, data: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, ...corsHeaders(req) },
  });
}

export async function GET(req: Request) {
  try {
    const { parameters, stand } = await haalPeil();
    laatsteStand = telPeil(parameters, Date.now(), stand);
    return antwoord(req, { ...laatsteStand, verouderd: false }, 200, CACHE);
  } catch {
    if (laatsteStand) {
      return antwoord(req, { ...laatsteStand, verouderd: true, opmerking: "PEIL is nu niet bereikbaar; dit is de laatst bekende stand." }, 200, "public, s-maxage=300, stale-while-revalidate=3600");
    }
    return antwoord(req, { fout: "De Peil-gegevens zijn nu niet beschikbaar. Probeer het later opnieuw." }, 503, "no-store");
  }
}
