import { geenOpslag, jsonAntwoord, leesOpslag, opties } from "@/lib/motor/api";
import { dagStart } from "@/lib/motor/tijd";
import { CATEGORIEEN } from "@/lib/motor/types";

export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => opties(req);

export async function GET(req: Request) {
  const opslag = leesOpslag();
  if (!opslag) return geenOpslag(req);
  try {
    // ?uren=24 telt de laatste N uur (voor de ochtendbrief); zonder parameter: vandaag sinds middernacht Amsterdam.
    const uren = Number(new URL(req.url).searchParams.get("uren"));
    const sinds = Number.isFinite(uren) && uren > 0 && uren <= 168 ? new Date(Date.now() - uren * 3600_000).toISOString() : dagStart();
    const t = await opslag.tellingenSinds(sinds);
    const perCategorie = Object.fromEntries(CATEGORIEEN.map((c) => [c, t[c] || 0]));
    const totaal = Object.values(perCategorie).reduce((a, b) => a + b, 0);
    return jsonAntwoord(req, { datum: sinds, sinds, tijdzone: "Europe/Amsterdam", totaal, perCategorie });
  } catch {
    return jsonAntwoord(req, { fout: "Tellingen konden niet worden gelezen." }, 502);
  }
}
