import { doorsturen, zelfdeHerkomst } from "@/lib/redactie-http";
import { wisCookieKop } from "@/lib/redactie-toegang";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!zelfdeHerkomst(req)) return new Response("Niet toegestaan.", { status: 403 });
  return doorsturen("/redactie/inloggen", { "set-cookie": wisCookieKop() });
}
