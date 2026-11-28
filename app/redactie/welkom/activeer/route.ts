import { leesOpslag } from "@/lib/motor/api";
import { jsonUit, zelfdeHerkomst } from "@/lib/redactie-http";
import { REDACTEUR_GELDIG_SECONDEN, afzender, cookieKop, maakRedacteurCookie, noteerFout, redacteurVoorToken, teVaak, wisFouten } from "@/lib/redactie-toegang";

export const dynamic = "force-dynamic";

/** Activeert een persoonlijke link: POST {token} (het token komt uit het #-deel van de link en staat nooit in een url of log). */
export async function POST(req: Request) {
  if (!zelfdeHerkomst(req)) return jsonUit({ fout: "Niet toegestaan." }, 403);
  const wie = afzender(req);
  if (teVaak(wie)) return jsonUit({ fout: "Te veel pogingen. Probeer het over tien minuten opnieuw." }, 429);
  let token: unknown;
  try {
    token = ((await req.json()) as { token?: unknown }).token;
  } catch { /* geen json */ }
  const r = await redacteurVoorToken(token, leesOpslag());
  if (!r) {
    noteerFout(wie);
    return jsonUit({ fout: "Deze link werkt niet (meer). Vraag om een nieuwe." }, 401);
  }
  wisFouten(wie);
  return jsonUit({ ok: true, naam: r.naam }, 200, { "set-cookie": cookieKop(maakRedacteurCookie(token as string), REDACTEUR_GELDIG_SECONDEN) });
}
