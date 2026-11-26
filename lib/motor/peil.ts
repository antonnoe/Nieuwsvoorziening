// PEIL-koppeling: raakt een bericht een parameter, en meldt het mogelijk een
// gewijzigde waarde? Eerst voorselectie op trefwoorden, dan twee onafhankelijke controles
// (goedkoop model en synthesemodel, besluit 26-11-2026 "PEIL streng"); zekerheid in peilbeoordeling.ts. PEIL zelf wordt NOOIT aangepast: alleen lezen en een signaal
// in nv_peil_signalen. Model naar het voorbeeld van nlfr-menu lib/selectie/kern.js.
import { haalJson, type ModelClient } from "./ai";
import { modelGoedkoop, modelSynthese, PEIL_URL } from "./config";
import { beoordeel, leesControle, ontbreektSleutel, type Controle } from "./peilbeoordeling";
import { kernwoorden, normaliseer } from "./tekst";
import type { PeilKoppeling, PeilParameter, PeilSignaalNieuw } from "./types";

const PEIL_STOP = new Set(
  ("tarief tarieven bedrag percentage procent regel regels belasting belastingen drempel drempels maximum minimum jaar jaren aangifte " +
    "maximale minimale totaal korting partner bedragen frankrijk nederland franse nederlandse wet wetten").split(" ")
);

export function peilTermen(p: PeilParameter): string[] {
  const tref = kernwoorden(p.trefwoorden || "").filter((w) => w.length >= 3 && !PEIL_STOP.has(w));
  // kernwoorden filtert < 4; trefwoorden mogen korte afkortingen (cak, aow, csg) hebben.
  const kort = normaliseer(p.trefwoorden || "").split(/[^a-z0-9]+/).filter((w) => w.length === 3 && !PEIL_STOP.has(w));
  const naam = kernwoorden(`${p.naam || ""} ${p.naam_fr || ""}`).filter((w) => w.length >= 5 && !PEIL_STOP.has(w));
  return [...new Set([...tref, ...kort, ...naam])];
}

/** Rangschikt op zeldzaamheid van de gevonden termen; door bij één zeldzame term of twee termen. */
export function peilVoorselectie(tekst: string, parameters: PeilParameter[], max = 6): PeilParameter[] {
  const woorden = new Set(normaliseer(tekst).replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
  const n = normaliseer(tekst);
  const termenPer = parameters.map(peilTermen);
  const df = new Map<string, number>();
  for (const t of termenPer) for (const x of t) df.set(x, (df.get(x) || 0) + 1);
  const scores: { p: PeilParameter; score: number }[] = [];
  parameters.forEach((p, i) => {
    let score = 0;
    let raak = 0;
    let zeldzaam = false;
    for (const t of termenPer[i]) {
      if (!(woorden.has(t) || (t.length >= 7 && n.includes(t)))) continue;
      const d = df.get(t) || 1;
      raak += 1;
      if (d <= 8) zeldzaam = true;
      score += Math.log(1 + parameters.length / d);
    }
    if (zeldzaam || raak >= 2) scores.push({ p, score });
  });
  return scores.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.p);
}

let cache: { op: number; parameters: PeilParameter[] } | null = null;

export async function laadPeil(ttlMin = 360, fetchFn: typeof fetch = fetch, nu = Date.now()): Promise<PeilParameter[]> {
  if (cache && nu - cache.op < ttlMin * 60_000) return cache.parameters;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetchFn(PEIL_URL, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`PEIL HTTP ${r.status}`);
    const d = (await r.json()) as { parameters?: PeilParameter[] };
    const parameters = Array.isArray(d.parameters) ? d.parameters.filter((p) => p && p.id) : [];
    if (!parameters.length) throw new Error("PEIL leeg");
    cache = { op: nu, parameters };
    return parameters;
  } finally {
    clearTimeout(t);
  }
}
export function wisPeilCache() {
  cache = null;
}

const leeg = (): PeilKoppeling => ({ raakt: [], mogelijkGewijzigd: [] });

/** Hooguit zoveel modelaanroepen per bericht (twee controles per kandidaat, plus de controle op "ontbreekt in PEIL"). */
export const MAX_PEIL_AANROEPEN = 6;

const REGELS = `Je bent een STRENGE controleur. Je beoordeelt of een nieuwsbericht precies over de grootheid of regel van één parameter uit het register PEIL gaat (een tarief, drempel, termijn of regel voor Nederlanders in Frankrijk).
- raakt: alleen true als het bericht precies over de grootheid of regel van déze parameter gaat, voor dezelfde doelgroep. Een verwant onderwerp, een ander onderdeel van dezelfde wet, een los woord of een algemeen verband is NIET genoeg. Voorbeeld: een bericht over het tijdpad van een verhuurverbod voor slecht geïsoleerde woningen gaat niet over de klassegrenzen van het energielabel. Twijfel je, zeg dan false.
- soort: "wijziging" als het bericht een nieuwe waarde of regel noemt of aankondigt, anders "alleen_raakt".
- nieuweWaarde: de nieuwe waarde zoals het bericht die noemt (kort, met eenheid), anders null. Verzin niets.
- ingangsdatum: de datum waarop de wijziging ingaat, als JJJJ-MM-DD (of JJJJ-MM of JJJJ), anders null. Verzin nooit een jaar of datum die niet in het bericht staat; gebruik de publicatiedatum bovenaan als houvast.
- definitief: true als het bericht de wijziging als vaststaand beschrijft (aangenomen, gepubliceerd, ingegaan), false bij een voorstel, plan, raming of discussie, null bij geen wijziging.
- citaat: een LETTERLIJK stuk (hooguit 25 woorden, niet herschreven) uit het bericht of de brongegevens dat laat zien dat het bericht precies hierover gaat. Kun je geen letterlijk citaat geven, zeg dan raakt=false.
- titel: de zaak in gewone Nederlandse taal, hooguit 7 woorden, zonder afkortingen, ids of Franse woorden.`;

const SYSTEEM_PARAMETER = `${REGELS}
Antwoord uitsluitend met JSON: {"raakt":true|false,"soort":"wijziging"|"alleen_raakt","nieuweWaarde":null,"ingangsdatum":null,"definitief":null,"citaat":"","titel":""}`;

const SYSTEEM_ONTBREEKT = `${REGELS}
Je krijgt hier geen parameter, maar de lijst met namen van alle parameters die PEIL al kent. Vraag: noemt het bericht duidelijk een financiële parameter of berekeningsgrondslag voor Nederlanders in Frankrijk (een tarief, drempel, termijn, bedrag of regel die iemand nodig heeft om iets uit te rekenen) die NIET in die lijst voorkomt, ook niet onder een andere naam? Zet dan "ontbreekt" op true. Gaat het om nieuws zonder zo'n grootheid, of staat het onderwerp al in de lijst, dan false. Gebruik dezelfde velden als hierboven, maar met "ontbreekt" in plaats van "raakt".
Antwoord uitsluitend met JSON: {"ontbreekt":true|false,"soort":"wijziging"|"alleen_raakt","nieuweWaarde":null,"ingangsdatum":null,"definitief":null,"citaat":"","titel":""}`;

export interface PeilOpties {
  /** Publicatiedatum van het bericht (ISO); voor de jaar- en verledencontrole. */
  publicatie?: string;
  bronUrl?: string | null;
  /** Ook controleren of het bericht een parameter noemt die in PEIL ontbreekt (alleen zinvol bij berichten die de portemonnee raken). */
  ontbreekt?: boolean;
}

export interface PeilToets {
  koppeling: PeilKoppeling;
  /** Signalen voor de redactie (groen of oranje); nog zonder berichtId. */
  signalen: PeilSignaalNieuw[];
  kandidaten: PeilParameter[];
  aanroepen: number;
  fout?: string;
}

/**
 * Twee onafhankelijke controles per kandidaat: het goedkope model eerst; alleen bij "ja" daarna het synthesemodel.
 * Koppeling (voor lezers) alleen bij zekerheid groen; oranje wordt een signaal voor de redactie; verder niets.
 * Bij een modelfout geen koppeling en geen signaal (fail closed).
 */
export async function peilKoppeling(
  bericht: { kop: string; samenvatting?: string; tekst: string },
  bronTekst: string,
  parameters: PeilParameter[],
  client: ModelClient | null,
  max = 6,
  opties: PeilOpties = {}
): Promise<PeilToets> {
  const alle = peilVoorselectie(`${bericht.kop} ${bericht.tekst}`, parameters, max);
  const kandidaten = alle.slice(0, opties.ontbreekt ? Math.min(alle.length, 4) : alle.length);
  const uit: PeilToets = { koppeling: leeg(), signalen: [], kandidaten, aanroepen: 0 };
  if (!client || (!kandidaten.length && !opties.ontbreekt)) return uit;
  const publicatie = opties.publicatie || new Date().toISOString();
  const tekst = `${bericht.kop} ${bericht.samenvatting || ""} ${bericht.tekst} ${bronTekst}`;
  const fouten: string[] = [];
  const bericht_ = `PUBLICATIEDATUM: ${publicatie.slice(0, 10)}\n\nBERICHT\n${bericht.kop}\n${bericht.samenvatting || ""}\n${bericht.tekst}\n\nBRONGEGEVENS\n${bronTekst.slice(0, 1500)}`;
  const vraag = async (model: string, system: string, user: string, sleutel: "raakt" | "ontbreekt"): Promise<Controle | null> => {
    if (uit.aanroepen >= MAX_PEIL_AANROEPEN) return null;
    uit.aanroepen += 1;
    try {
      const j = haalJson<unknown>(await client.tekst({ model, system, user, maxTokens: 500 }));
      const c = leesControle(j, sleutel);
      if (!c) throw new Error("PEIL-controle is geen bruikbare JSON");
      return c;
    } catch (e) {
      if (fouten.length < 3) fouten.push(e instanceof Error ? e.message.slice(0, 120) : String(e));
      return null;
    }
  };
  /** Beide controles; de tweede alleen als de eerste "ja" zegt. */
  const tweeControles = async (system: string, user: string, sleutel: "raakt" | "ontbreekt"): Promise<[Controle, Controle] | null> => {
    const a = await vraag(modelGoedkoop(), system, user, sleutel);
    if (!a || !a.raakt) return null;
    const b = await vraag(modelSynthese(), system, user, sleutel);
    return b && b.raakt ? [a, b] : null;
  };

  for (const p of kandidaten) {
    if (uit.aanroepen >= MAX_PEIL_AANROEPEN) break;
    const user = `${bericht_}\n\nPARAMETER\nnaam: ${p.naam}\ntrefwoorden: ${p.trefwoorden || ""}\nhuidige waarde in PEIL: ${String(p.waarde_weergave || "").slice(0, 240)}`;
    const t = await tweeControles(SYSTEEM_PARAMETER, user, "raakt");
    if (!t) continue;
    const [a, b] = t;
    const o = beoordeel(a, b, { tekst, publicatie });
    if (!o) continue;
    if (o.zekerheid === "groen") {
      uit.koppeling.raakt.push({ id: p.id, naam: p.naam, bronUrl: p.bron_url || null, tools: (p.tools || []).filter((x) => x && x.naam).map((x) => ({ naam: String(x.naam), url: x.url || null })), zekerheid: "groen" });
      if (o.soort === "wijziging") uit.koppeling.mogelijkGewijzigd.push({ id: p.id, naam: p.naam, toelichting: `${b.nieuweWaarde || "nieuwe waarde"}${b.ingangsdatum ? `, vanaf ${b.ingangsdatum}` : ""}`.slice(0, 300) });
    }
    // Een signaal alleen bij een wijziging (groen of oranje); "alleen raakt" met twijfel krijgt niets.
    if (o.soort === "wijziging") {
      uit.signalen.push({
        parameterId: p.id, parameterNaam: p.naam, soort: "wijziging", zekerheid: o.zekerheid, titel: b.titel || a.titel || p.naam,
        toelichting: (o.twijfel || `Het bericht noemt ${b.nieuweWaarde || "een nieuwe waarde"}.`).slice(0, 300),
        nieuweWaarde: b.nieuweWaarde, huidigeWaarde: String(p.waarde_weergave || "").slice(0, 240) || null, vanaf: b.ingangsdatum, definitief: b.definitief,
        twijfel: o.twijfel, citaat: b.citaat || null, bronUrl: opties.bronUrl ?? null,
      });
    }
  }

  // Ontbreekt in PEIL: alleen als er geen groene koppeling is en er nog ruimte in het aanroepbudget is.
  if (opties.ontbreekt && !uit.koppeling.raakt.length && uit.aanroepen < MAX_PEIL_AANROEPEN) {
    const namen = parameters.map((p) => p.naam).join("; ").slice(0, 8000);
    const t = await tweeControles(SYSTEEM_ONTBREEKT, `${bericht_}\n\nPARAMETERS DIE PEIL AL KENT\n${namen}`, "ontbreekt");
    if (t) {
      const [a, b] = t;
      const titel = b.titel || a.titel;
      const o = titel ? beoordeel(a, b, { tekst, publicatie, ontbreekt: true }) : null;
      if (o && titel) {
        uit.signalen.push({
          parameterId: ontbreektSleutel(titel), parameterNaam: titel, soort: "ontbreekt", zekerheid: o.zekerheid, titel,
          toelichting: (o.twijfel || "Het bericht noemt een grootheid die PEIL nog niet kent.").slice(0, 300),
          nieuweWaarde: b.nieuweWaarde, huidigeWaarde: null, vanaf: b.ingangsdatum, definitief: b.definitief, twijfel: o.twijfel, citaat: b.citaat || null, bronUrl: opties.bronUrl ?? null,
        });
      }
    }
  }
  if (fouten.length) uit.fout = fouten.join("; ");
  return uit;
}
