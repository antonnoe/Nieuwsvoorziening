import { geenOpslag, jsonAntwoord, leesOpslag, opties } from "@/lib/motor/api";
import { OVERHEID_THEMA_NAAM } from "@/lib/motor/types";
import { veiligeUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => opties(req);

/** Publieke vorm van een overheidskort: alleen wat een lezer ziet, nooit de reden of de redactiestand. */
export async function GET(req: Request) {
  const opslag = leesOpslag();
  if (!opslag) return geenOpslag(req);
  const limiet = Math.max(1, Math.min(100, Number(new URL(req.url).searchParams.get("limiet")) || 20));
  try {
    const korten = await opslag.overheidKortLijst({ limiet });
    const lijst = korten
      .filter((k) => k.relevant && k.redactie !== "weg" && veiligeUrl(k.itemUrl))
      .map((k) => ({ titel: k.titel, samenvatting: k.samenvatting, thema: k.thema, themaNaam: k.thema ? OVERHEID_THEMA_NAAM[k.thema] : null, bron: k.bronNaam, datum: k.datum, url: k.itemUrl }));
    return jsonAntwoord(req, { aantal: lijst.length, items: lijst }, 200, 60);
  } catch {
    return jsonAntwoord(req, { fout: "Overheidsberichten konden niet worden gelezen." }, 502);
  }
}
