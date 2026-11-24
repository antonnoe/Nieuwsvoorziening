import { cookieKop, geheim, maakCookieWaarde, sleutelKlopt } from "@/lib/beheer";

export const dynamic = "force-dynamic";

// Rem in het geheugen van deze instantie: hooguit 5 foute pogingen per 10 minuten per afzender.
const pogingen = new Map<string, number[]>();

const terug = (extra: Record<string, string> = {}, status = 303, plek = "/beheer") =>
  new Response(null, { status, headers: { location: plek, "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", ...extra } });

/** POST met het veld `sleutel` in de body (nooit in de URL). Bij succes: cookie httpOnly, Secure, SameSite=Strict. */
export async function POST(req: Request) {
  if (!geheim()) return new Response("Beheer is dicht.", { status: 503, headers: { "x-robots-tag": "noindex" } });
  const wie = (req.headers.get("x-forwarded-for") || "onbekend").split(",")[0].trim();
  const nu = Date.now();
  const recent = (pogingen.get(wie) || []).filter((t) => nu - t < 600_000);
  if (recent.length >= 5) return terug({}, 303, "/beheer?fout=te-vaak");
  let ingevuld = "";
  try {
    ingevuld = String((await req.formData()).get("sleutel") || "");
  } catch { /* geen formulier */ }
  const waarde = sleutelKlopt(ingevuld) ? maakCookieWaarde(nu) : null;
  if (!waarde) {
    pogingen.set(wie, [...recent, nu]);
    return terug({}, 303, "/beheer?fout=onjuist");
  }
  pogingen.delete(wie);
  return terug({ "set-cookie": cookieKop(waarde) });
}
