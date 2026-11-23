import { maakModelClient } from "@/lib/motor/ai";
import { cronToegestaan } from "@/lib/motor/cron-auth";
import { draaiOogst } from "@/lib/motor/motor";
import { GeheugenOpslag, maakOpslag } from "@/lib/motor/opslag";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

async function uitvoeren(req: Request) {
  if (!cronToegestaan(req)) return Response.json({ fout: "Niet toegestaan." }, { status: 401 });
  const forceerDroog = new URL(req.url).searchParams.get("droog") === "1";
  const echt = forceerDroog ? null : maakOpslag();
  const opslag = echt || new GeheugenOpslag();
  try {
    const r = await draaiOogst({ opslag, client: maakModelClient(), droog: !echt });
    return Response.json({
      droog: !echt,
      aantallen: r.aantallen,
      stappen: r.stappen.map((s) => ({ stap: s.stap, ok: s.ok, aantal: s.aantal, fout: s.fout })),
      fouten: r.fouten,
      berichten: r.berichten.map((b) => ({ kop: b.kop, categorie: b.categorie, score: b.score, status: b.status, redenen: b.blokkadeRedenen })),
    });
  } catch (e) {
    return Response.json({ fout: e instanceof Error ? e.message.slice(0, 200) : "Onbekende fout" }, { status: 500 });
  }
}

export const GET = uitvoeren;
export const POST = uitvoeren;
