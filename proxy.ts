// Verlengt het cookie van een redacteur bij elk bezoek aan /redactie (90 dagen vanaf het laatste gebruik). Het cookie zelf wordt hier niet
// beoordeeld: dat doet elke pagina en route (een ingetrokken link blijft dicht, ook als het cookie hier wordt verlengd).
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const waarde = req.cookies.get("nv_redactie")?.value;
  if (waarde && waarde.startsWith("r.")) {
    res.cookies.set({ name: "nv_redactie", value: waarde, httpOnly: true, secure: true, sameSite: "strict", path: "/redactie", maxAge: 90 * 86400 });
  }
  return res;
}

export const config = { matcher: ["/redactie/:path*"] };
