import { geenOpslag, jsonAntwoord, leesOpslag, opties, publiekBericht } from "@/lib/motor/api";

export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => opties(req);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const opslag = leesOpslag();
  if (!opslag) return geenOpslag(req);
  const { id } = await ctx.params;
  try {
    const b = await opslag.bericht(id);
    if (!b) return jsonAntwoord(req, { fout: "Bericht niet gevonden." }, 404);
    return jsonAntwoord(req, publiekBericht(b, true, b.signalen.map((s) => s.parameterId)));
  } catch {
    return jsonAntwoord(req, { fout: "Bericht kon niet worden gelezen." }, 502);
  }
}
