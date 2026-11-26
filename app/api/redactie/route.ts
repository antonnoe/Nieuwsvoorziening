import { geenOpslag, leesOpslag } from "@/lib/motor/api";
import { MigratieOntbreekt } from "@/lib/motor/opslag";
import { controleerToegang, leesOpdracht, poortBlokkade, redactieAntwoord, redactieCors, redactieVorm, toegangFout } from "@/lib/redactie";

export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: redactieCors(req) });

const GEEN_MIGRATIE = { fout: "De migratie voor kanalen en redactie is nog niet toegepast; deze actie kan nog niet worden bewaard." };

/** Alle berichten van de laatste N dagen (standaard 2, hooguit 30), ook concept, geblokkeerd en "weg". */
export async function GET(req: Request) {
  const t = controleerToegang(req);
  if (t !== "ok") return toegangFout(req, t);
  const opslag = leesOpslag();
  if (!opslag) return geenOpslag(req);
  const dagenRuw = Number(new URL(req.url).searchParams.get("dagen"));
  const dagen = Number.isFinite(dagenRuw) && dagenRuw >= 1 ? Math.min(30, Math.floor(dagenRuw)) : 2;
  try {
    const lijst = await opslag.berichtenVoorRedactie(new Date(Date.now() - dagen * 86400_000).toISOString(), 500);
    // Voor de statusregel "De nieuwsmotor loopt, laatste ronde ...": een storing hier laat de lijst niet falen.
    const run = await opslag.laatsteRun().catch(() => null);
    return redactieAntwoord(req, {
      dagen,
      aantal: lijst.length,
      aantalNietGeplaatst: lijst.filter((b) => b.status !== "gepubliceerd").length,
      laatsteRun: run ? { gestartOp: run.gestartOp, klaarOp: run.klaarOp ?? null, droog: run.droog, aantallen: run.aantallen, fouten: run.fouten.slice(0, 5) } : null,
      berichten: lijst.map(redactieVorm),
    });
  } catch {
    return redactieAntwoord(req, { fout: "Berichten konden niet worden gelezen." }, 502);
  }
}

/** Body: {id, actie: "weg"|"terug"|"kanaal", kanaal?, aan?}. Geeft het bijgewerkte bericht terug. */
export async function POST(req: Request) {
  const t = controleerToegang(req);
  if (t !== "ok") return toegangFout(req, t);
  const opslag = leesOpslag();
  if (!opslag) return geenOpslag(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return redactieAntwoord(req, { fout: "Body is geen geldige JSON." }, 400);
  }
  const l = leesOpdracht(body);
  if ("fout" in l) return redactieAntwoord(req, { fout: l.fout }, 400);
  const { opdracht } = l;
  try {
    const bestaat = await opslag.redactieBericht(opdracht.id);
    if (!bestaat) return redactieAntwoord(req, { fout: "Bericht niet gevonden." }, 404);
    if (opdracht.actie === "plaats") {
      if (bestaat.status === "gepubliceerd") return redactieAntwoord(req, { fout: "Dit bericht staat al geplaatst." }, 409);
      if (poortBlokkade(bestaat)) return redactieAntwoord(req, { fout: `De kwaliteitspoort heeft dit bericht tegengehouden en dat kan hier niet worden omzeild: ${bestaat.blokkadeRedenen.join("; ") || "geblokkeerd"}. Laat het opnieuw schrijven of pas het aan.` }, 409);
      if (bestaat.redactie === "weg") return redactieAntwoord(req, { fout: "Dit bericht staat op weg. Haal het eerst terug." }, 409);
      await opslag.zetStatus(opdracht.id, "gepubliceerd");
    } else if (opdracht.actie === "herschrijf") {
      if (bestaat.handmatigOp) return redactieAntwoord(req, { fout: "Dit bericht is handmatig aangepast en wordt nooit automatisch herschreven." }, 409);
      await opslag.markeerHerschrijven(opdracht.id);
    } else if (opdracht.actie === "bewerk") await opslag.bewerkBericht(opdracht.id, opdracht.bewerk!);
    else if (opdracht.actie === "weg") await opslag.zetRedactie(opdracht.id, "weg");
    else if (opdracht.actie === "terug") await opslag.zetRedactie(opdracht.id, null);
    else await opslag.zetKanaal(opdracht.id, opdracht.kanaal!, opdracht.aan!);
    const nu = await opslag.redactieBericht(opdracht.id);
    return redactieAntwoord(req, { bericht: nu ? redactieVorm(nu) : null });
  } catch (e) {
    if (e instanceof MigratieOntbreekt) return redactieAntwoord(req, GEEN_MIGRATIE, 503);
    return redactieAntwoord(req, { fout: "De wijziging kon niet worden bewaard." }, 502);
  }
}
