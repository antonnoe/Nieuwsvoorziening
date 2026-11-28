import { geenOpslag, leesOpslag } from "@/lib/motor/api";
import { MigratieOntbreekt } from "@/lib/motor/opslag";
import { RadarOntbreekt } from "@/lib/motor/radar";
import { radarVorm } from "@/lib/motor/radar";
import { controleerToegang, leesOpdracht, peilVorm, poortBlokkade, redactieAntwoord, redactieCors, redactieVorm, toegangFout } from "@/lib/redactie";

export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: redactieCors(req) });

const GEEN_MIGRATIE = { fout: "De migratie (kanalen en redactie, of PEIL streng) is nog niet toegepast; deze actie kan nog niet worden bewaard." };

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
    // Open PEIL-signalen (groen en oranje) voor de redactie; een storing of ontbrekende migratie laat de lijst niet falen.
    const peil = (await opslag.peilSignalen(200).catch(() => [])).map(peilVorm);
    // Radar (28-11-2026): open onderwerpsignalen, nieuwste eerst, hooguit 50; alleen voor de redactie. Zonder tabel nv_radar: leeg.
    const radar = (await opslag.radarOpen(50).catch(() => [])).map(radarVorm);
    return redactieAntwoord(req, {
      dagen,
      aantal: lijst.length,
      aantalNietGeplaatst: lijst.filter((b) => b.status !== "gepubliceerd").length,
      laatsteRun: run ? { gestartOp: run.gestartOp, klaarOp: run.klaarOp ?? null, droog: run.droog, aantallen: run.aantallen, fouten: run.fouten.slice(0, 5) } : null,
      berichten: lijst.map(redactieVorm),
      peil,
      radar,
    });
  } catch {
    return redactieAntwoord(req, { fout: "Berichten konden niet worden gelezen." }, 502);
  }
}

/** Body: {id, actie: "weg"|"terug"|"kanaal"|..., kanaal?, aan?}, {actie: "peil", id: signaal-id, keuze} of {actie: "radar", id: radar-id, keuze: "geaccepteerd"|"afgewezen"}. Geeft het bijgewerkte bericht (of het signaal) terug. */
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
    if (opdracht.actie === "peil") {
      const sig = await opslag.peilSignaal(opdracht.id);
      if (!sig) return redactieAntwoord(req, { fout: "Signaal niet gevonden." }, 404);
      if (sig.status !== "gesignaleerd") return redactieAntwoord(req, { fout: `Dit signaal is al afgehandeld (status ${sig.status}) en kan niet nog een keer worden beslist.` }, 409);
      await opslag.zetPeilBesluit(opdracht.id, opdracht.keuze!);
      // Bij "raakt niet" verdwijnt de koppeling ook bij het bericht, zodat lezers hem niet meer zien. PEIL zelf blijft ongemoeid.
      if (opdracht.keuze === "raakt_niet" && sig.soort === "wijziging") {
        const b = await opslag.redactieBericht(sig.berichtId);
        if (b) await opslag.zetPeilKoppeling(b.id, { raakt: b.peil.raakt.filter((r) => r.id !== sig.parameterId), mogelijkGewijzigd: b.peil.mogelijkGewijzigd.filter((r) => r.id !== sig.parameterId) });
      }
      return redactieAntwoord(req, { signaal: { id: sig.id, status: opdracht.keuze } });
    }
    if (opdracht.actie === "radar") {
      const rij = await opslag.radarRij(opdracht.id);
      if (!rij) return redactieAntwoord(req, { fout: "Radarsignaal niet gevonden." }, 404);
      if (rij.besluit) return redactieAntwoord(req, { fout: `Dit radarsignaal is al afgehandeld (${rij.besluit}).` }, 409);
      await opslag.zetRadarBesluit(opdracht.id, opdracht.radarKeuze!);
      return redactieAntwoord(req, { radar: { id: rij.id, besluit: opdracht.radarKeuze } });
    }
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
    if (e instanceof MigratieOntbreekt || e instanceof RadarOntbreekt) return redactieAntwoord(req, GEEN_MIGRATIE, 503);
    return redactieAntwoord(req, { fout: "De wijziging kon niet worden bewaard." }, 502);
  }
}
