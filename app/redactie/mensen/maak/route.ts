import { eisJson, jsonUit } from "@/lib/redactie-http";
import { maakVrijwilliger } from "@/lib/redactie-toegang";

export const dynamic = "force-dynamic";

/** Vrijwilliger toevoegen (alleen beheerder). Het token staat alleen in dit antwoord; in de database komt alleen de hash. */
export async function POST(req: Request) {
  const t = await eisJson(req, { beheerder: true });
  if ("antwoord" in t) return t.antwoord;
  let naam = "";
  try {
    naam = String(((await req.json()) as { naam?: unknown }).naam ?? "");
  } catch { /* geen json */ }
  const u = await maakVrijwilliger(t.opslag, naam);
  if (!u.ok) return jsonUit({ fout: u.melding }, 400);
  return jsonUit({ ok: true, naam: u.redacteur.naam, token: u.token });
}
