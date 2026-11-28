import { leesOpslag } from "@/lib/motor/api";
import { doorsturen, toegangVoor, zelfdeHerkomst } from "@/lib/redactie-http";
import { metMelding, voerActieUit } from "@/lib/redactie-acties";

export const dynamic = "force-dynamic";
// Een bron toevoegen leest een site en een feed; dat mag even duren.
export const maxDuration = 60;

/** Alle eenvoudige handelingen van de redactie-app (formulier-POST, werkt zonder JavaScript); daarna terug met een melding. */
export async function POST(req: Request) {
  if (!zelfdeHerkomst(req)) return new Response("Niet toegestaan.", { status: 403 });
  const opslag = leesOpslag();
  const toegang = await toegangVoor(req, opslag);
  if (!toegang) return doorsturen("/redactie/inloggen");
  const f: Record<string, string> = {};
  try {
    for (const [k, v] of (await req.formData()).entries()) if (typeof v === "string") f[k] = v.slice(0, 600);
  } catch { /* geen formulier */ }
  if (!opslag) return doorsturen(metMelding(f.terug || "/redactie", "De opslag is niet beschikbaar.", false));
  const u = await voerActieUit(opslag, toegang, f);
  return doorsturen(metMelding(u.terug, u.melding, u.ok));
}
