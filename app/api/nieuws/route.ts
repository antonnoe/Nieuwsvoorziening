import { geenOpslag, geldigeCategorie, jsonAntwoord, leesOpslag, opties, publiekBericht } from "@/lib/motor/api";

export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => opties(req);

export async function GET(req: Request) {
  const opslag = leesOpslag();
  if (!opslag) return geenOpslag(req);
  const u = new URL(req.url);
  const catRuw = u.searchParams.get("categorie");
  const categorie = geldigeCategorie(catRuw);
  if (catRuw && !categorie) return jsonAntwoord(req, { fout: "Onbekende categorie." }, 400);
  const limiet = Math.max(1, Math.min(100, Number(u.searchParams.get("limiet")) || 20));
  const peil = ["1", "true"].includes((u.searchParams.get("peil") || "").toLowerCase());
  try {
    const lijst = await opslag.berichten({ categorie, limiet, peil });
    return jsonAntwoord(req, { aantal: lijst.length, berichten: lijst.map((b) => publiekBericht(b, false)) });
  } catch {
    return jsonAntwoord(req, { fout: "Berichten konden niet worden gelezen." }, 502);
  }
}
