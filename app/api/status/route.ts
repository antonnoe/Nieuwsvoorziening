import { jsonAntwoord, leesOpslag, opties } from "@/lib/motor/api";
import { laadBronnen, modelGoedkoop, modelSynthese } from "@/lib/motor/config";

export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => opties(req);

export async function GET(req: Request) {
  const opslag = leesOpslag();
  const bronnen = laadBronnen();
  const basis = {
    bronnen: { actief: bronnen.filter((b) => b.status === "ACTIVE").length, concept: bronnen.filter((b) => b.status === "CONCEPT").length },
    modellen: { synthese: modelSynthese(), goedkoop: modelGoedkoop() },
    beeldGenerator: Boolean(String(process.env.BEELD_GENERATOR || "").trim()),
    opslag: Boolean(opslag),
  };
  if (!opslag) return jsonAntwoord(req, { ...basis, fout: "Opslag niet geconfigureerd." }, 503);
  try {
    const [run, aantallen] = await Promise.all([opslag.laatsteRun(), opslag.aantallen()]);
    return jsonAntwoord(req, {
      ...basis,
      laatsteOogst: run ? { gestartOp: run.gestartOp, klaarOp: run.klaarOp || null, aantallen: run.aantallen, fouten: run.fouten.slice(0, 20) } : null,
      aantallen,
    }, 200, 30);
  } catch {
    return jsonAntwoord(req, { ...basis, fout: "Status kon niet worden gelezen." }, 502);
  }
}
