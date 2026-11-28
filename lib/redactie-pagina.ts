// Toegangscontrole voor de pagina's van de redactie-app (server components): zonder geldig cookie naar de inlogpagina.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { leesOpslag } from "@/lib/motor/api";
import type { Opslag } from "@/lib/motor/opslag";
import { REDACTIE_COOKIE, bepaalToegang, type Toegang } from "@/lib/redactie-toegang";

export async function eisToegang(o: { beheerder?: boolean } = {}): Promise<{ toegang: Toegang; opslag: Opslag | null }> {
  const opslag = leesOpslag();
  const toegang = await bepaalToegang((await cookies()).get(REDACTIE_COOKIE)?.value, opslag);
  if (!toegang) redirect("/redactie/inloggen");
  if (o.beheerder && toegang.rol !== "beheerder") redirect("/redactie");
  return { toegang, opslag };
}

/** Een melding uit de url (`?m=...&ok=1`), alleen tekst, begrensd. */
export function leesMelding(sp: { m?: string | string[]; ok?: string | string[] }): { tekst: string; ok: boolean } | null {
  const m = Array.isArray(sp.m) ? sp.m[0] : sp.m;
  if (!m) return null;
  const ok = (Array.isArray(sp.ok) ? sp.ok[0] : sp.ok) === "1";
  return { tekst: String(m).slice(0, 200), ok };
}
