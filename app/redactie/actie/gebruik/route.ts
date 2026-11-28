import { gebruikTekening } from "@/lib/redactie-acties";
import { eisJson, jsonUit } from "@/lib/redactie-http";

export const dynamic = "force-dynamic";

/** "Gebruiken": de SVG wordt opnieuw gecontroleerd en pas daarna opgeslagen en aan het bericht gehangen. */
export async function POST(req: Request) {
  const t = await eisJson(req);
  if ("antwoord" in t) return t.antwoord;
  let b: { id?: unknown; svg?: unknown; naam?: unknown } = {};
  try {
    b = (await req.json()) as typeof b;
  } catch { /* geen json */ }
  try {
    const u = await gebruikTekening(t.opslag, String(b.id ?? ""), b.svg, b.naam);
    return jsonUit(u, u.ok ? 200 : 422);
  } catch {
    return jsonUit({ ok: false, melding: "Dat is niet gelukt. Probeer het later opnieuw." }, 502);
  }
}
