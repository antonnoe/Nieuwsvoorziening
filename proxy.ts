// Verlengt het cookie van een redacteur bij elk bezoek aan /redactie (90 dagen vanaf het laatste gebruik), maar alleen als het token geldig is
// (bestaat en niet is ingetrokken). Een ongeldig of ingetrokken cookie wordt gewist. Is de opslag onbereikbaar, dan blijft het cookie ongemoeid.
// De toegang zelf beoordeelt elke pagina en route.
import { NextResponse, type NextRequest } from "next/server";
import { leesOpslag } from "@/lib/motor/api";
import { REDACTEUR_GELDIG_SECONDEN, REDACTIE_COOKIE, cookieVerlenging } from "@/lib/redactie-toegang";

/** Routes die zelf een cookie zetten of wissen: daar doet de proxy niets, anders kan zijn wis-cookie dat van de route overschrijven. */
const EIGEN_COOKIE = /^\/redactie\/(welkom|aanmelden|uitloggen)(\/|$)/;

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (EIGEN_COOKIE.test(req.nextUrl.pathname)) return res;
  const waarde = req.cookies.get(REDACTIE_COOKIE)?.value;
  const doen = await cookieVerlenging(waarde, leesOpslag());
  if (doen === "verleng") res.cookies.set({ name: REDACTIE_COOKIE, value: waarde as string, httpOnly: true, secure: true, sameSite: "strict", path: "/redactie", maxAge: REDACTEUR_GELDIG_SECONDEN });
  else if (doen === "wis") res.cookies.set({ name: REDACTIE_COOKIE, value: "", httpOnly: true, secure: true, sameSite: "strict", path: "/redactie", maxAge: 0 });
  return res;
}

export const config = { matcher: ["/redactie/:path*"] };
