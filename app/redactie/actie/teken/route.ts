import { tekenClient, tekenVoorBericht } from "@/lib/redactie-acties";
import { eisJson, jsonUit } from "@/lib/redactie-http";

export const dynamic = "force-dynamic";
// Een tekening is een lang modelantwoord.
export const maxDuration = 120;

/** Laat het synthesemodel een tekening maken; er wordt niets opgeslagen. Antwoord: {ok, svg, naam} of {ok:false, melding}. */
export async function POST(req: Request) {
  const t = await eisJson(req);
  if ("antwoord" in t) return t.antwoord;
  let id = "";
  try {
    id = String(((await req.json()) as { id?: unknown }).id ?? "");
  } catch { /* geen json */ }
  const u = await tekenVoorBericht(t.opslag, tekenClient(), id);
  return jsonUit(u, u.ok ? 200 : 422);
}
