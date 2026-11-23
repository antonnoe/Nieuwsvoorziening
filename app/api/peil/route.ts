// Openbare lijst "Wat verandert er voor u": dezelfde aangekondigde PEIL-wijzigingen
// met leesbare zin als op de voorpagina, zodat de nieuwsbrief dezelfde bron gebruikt
// (één ding, één plek). Alleen lezen. ?max=1..12 (standaard 4).
import { jsonAntwoord, opties } from "@/lib/motor/api";
import { laadAankondigingen } from "@/lib/peilvak";

export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => opties(req);

export async function GET(req: Request) {
  const max = Math.max(1, Math.min(12, Number(new URL(req.url).searchParams.get("max")) || 4));
  const { lijst, totaal } = await laadAankondigingen(max);
  return jsonAntwoord(req, { totaal, peilUrl: "https://communitiesabroad.com/peil", aankondigingen: lijst.map((a) => ({ ...a, nieuws: a.nieuws.map((n) => ({ ...n, url: `https://nieuws.infofrankrijk.com/bericht/${n.id}` })) })) }, 200, 300);
}
