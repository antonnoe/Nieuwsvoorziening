import { redactieGeheim } from "@/lib/redactie";
import { doorsturen, zelfdeHerkomst } from "@/lib/redactie-http";
import { BEHEERDER_GELDIG_SECONDEN, afzender, beheerderSleutelKlopt, cookieKop, maakBeheerderCookie, noteerFout, teVaak, wisFouten } from "@/lib/redactie-toegang";

export const dynamic = "force-dynamic";

/** Inloggen van de beheerder: POST met het veld `sleutel` in de body (nooit in de url). Rem: 5 pogingen per 10 minuten. */
export async function POST(req: Request) {
  if (!zelfdeHerkomst(req)) return new Response("Niet toegestaan.", { status: 403 });
  if (!redactieGeheim()) return doorsturen("/redactie/inloggen?fout=dicht");
  const wie = afzender(req);
  if (teVaak(wie)) return doorsturen("/redactie/inloggen?fout=te-vaak");
  let ingevuld = "";
  try {
    ingevuld = String((await req.formData()).get("sleutel") || "");
  } catch { /* geen formulier */ }
  const waarde = beheerderSleutelKlopt(ingevuld) ? maakBeheerderCookie() : null;
  if (!waarde) {
    noteerFout(wie);
    return doorsturen("/redactie/inloggen?fout=onjuist");
  }
  wisFouten(wie);
  return doorsturen("/redactie", { "set-cookie": cookieKop(waarde, BEHEERDER_GELDIG_SECONDEN) });
}
