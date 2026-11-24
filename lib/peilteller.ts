// Teller "Peil bijgewerkt": hoeveel PEIL-parameters hebben een verificatiedatum in de
// huidige kalendermaand en het huidige kalenderjaar (Europe/Amsterdam). PEIL houdt GEEN
// aanmaakdatum per parameter bij (gemeten 24-11-2026: velden id, naam, naam_fr,
// waarde_weergave, eenheid, geldig_jaar, geldig_van, geldig_tot, land, bron_url,
// bron_kenmerk, verificatiedatum, status, volgende_controle, trefwoorden, categorie,
// tools, aangekondigd, volgende_periode). "Toegevoegd" is dus niet meetbaar en komt
// nergens in de uitvoer voor. geldig_van is een ingangsdatum van de regel, geen aanmaakdatum.
import type { PeilParameter } from "./motor/types";

const TZ = "Europe/Amsterdam";

export interface PeilTeller {
  /** Wat er geteld is, zodat niemand er meer in leest dan er staat. */
  meting: string;
  maand: { periode: string; bijgewerkt: number };
  jaar: { periode: string; bijgewerkt: number };
  totaalParameters: number;
  /** Datum van de PEIL-export (stand), zoals PEIL die zelf opgeeft. */
  peilStand: string | null;
  /** Tijd van de telling (ISO, UTC). */
  geteldOp: string;
}

/** Jaar en maand van dit moment in Europe/Amsterdam. */
export function amsterdamJaarMaand(nu: number): { jaar: string; maand: string } {
  const p: Record<string, string> = {};
  for (const d of new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(new Date(nu))) {
    if (d.type !== "literal") p[d.type] = d.value;
  }
  return { jaar: p.year, maand: p.month };
}

export function telPeil(parameters: PeilParameter[], nu: number, peilStand: string | null = null): PeilTeller {
  const { jaar, maand } = amsterdamJaarMaand(nu);
  const dezeMaand = `${jaar}-${maand}`;
  let m = 0;
  let j = 0;
  for (const p of parameters) {
    // verificatiedatum is een kale datum (YYYY-MM-DD) en dus al een kalenderdag.
    const v = typeof p.verificatiedatum === "string" ? p.verificatiedatum.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
    if (v.slice(0, 4) === jaar) j += 1;
    if (v.slice(0, 7) === dezeMaand) m += 1;
  }
  return {
    meting: "Aantal parameters in PEIL waarvan de verificatiedatum in de periode valt (nagelopen of bijgewerkt). Een aanmaakdatum houdt PEIL niet bij, dus wat nieuw is toegevoegd is niet te tellen.",
    maand: { periode: dezeMaand, bijgewerkt: m },
    jaar: { periode: jaar, bijgewerkt: j },
    totaalParameters: parameters.length,
    peilStand: peilStand && /^\d{4}-\d{2}-\d{2}/.test(peilStand) ? peilStand.slice(0, 10) : null,
    geteldOp: new Date(nu).toISOString(),
  };
}
