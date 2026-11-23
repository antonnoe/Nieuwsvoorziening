// PEIL-koppeling: raakt een bericht een parameter, en meldt het mogelijk een
// gewijzigde waarde? Eerst voorselectie op trefwoorden, dan het oordeel van een
// goedkoop model. PEIL zelf wordt NOOIT aangepast: alleen lezen en een signaal
// in nv_peil_signalen. Model naar het voorbeeld van nlfr-menu lib/selectie/kern.js.
import { haalJson, type ModelClient } from "./ai";
import { modelGoedkoop, PEIL_URL } from "./config";
import { kernwoorden, normaliseer } from "./tekst";
import type { PeilKoppeling, PeilParameter } from "./types";

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

const SYSTEEM = `Je controleert of een nieuwsbericht een parameter uit het register PEIL raakt (een tarief, drempel, termijn of regel voor Nederlanders in Frankrijk). Je krijgt het bericht en een korte lijst kandidaat-parameters met hun huidige waarde. Beoordeel per parameter:
- raakt: het bericht gaat inhoudelijk over dit onderwerp (niet alleen een los woord).
- mogelijkGewijzigd: het bericht noemt een concrete waarde, datum of regel voor dit onderwerp die afwijkt van de huidige waarde in PEIL, of kondigt een wijziging aan. Wees terughoudend: alleen bij een duidelijk verschil.
Antwoord uitsluitend met JSON: {"raakt":["id1"],"mogelijkGewijzigd":[{"id":"id1","toelichting":"één zin"}]}. Een id in mogelijkGewijzigd staat ook in raakt.`;

export async function peilKoppeling(
  bericht: { kop: string; tekst: string },
  bronTekst: string,
  parameters: PeilParameter[],
  client: ModelClient | null,
  max = 6
): Promise<{ koppeling: PeilKoppeling; kandidaten: PeilParameter[]; fout?: string }> {
  const kandidaten = peilVoorselectie(`${bericht.kop} ${bericht.tekst}`, parameters, max);
  if (!kandidaten.length || !client) return { koppeling: leeg(), kandidaten };
  try {
    const lijst = kandidaten.map((p) => `- ${p.id} | ${p.naam} | huidige waarde: ${String(p.waarde_weergave || "").slice(0, 240)}`).join("\n");
    const antw = await client.tekst({
      model: modelGoedkoop(), system: SYSTEEM, maxTokens: 800,
      user: `BERICHT\n${bericht.kop}\n${bericht.tekst}\n\nBRONGEGEVENS\n${bronTekst.slice(0, 1500)}\n\nKANDIDATEN\n${lijst}`,
    });
    const j = haalJson<{ raakt?: unknown; mogelijkGewijzigd?: unknown }>(antw);
    if (!j) throw new Error("PEIL-oordeel is geen JSON");
    const perId = new Map(kandidaten.map((p) => [p.id, p]));
    const raakt = (Array.isArray(j.raakt) ? j.raakt : []).map(String).filter((id) => perId.has(id));
    const gewijzigd = (Array.isArray(j.mogelijkGewijzigd) ? j.mogelijkGewijzigd : [])
      .map((x) => x as { id?: unknown; toelichting?: unknown })
      .filter((x) => x && perId.has(String(x.id)))
      .map((x) => ({ id: String(x.id), naam: perId.get(String(x.id))!.naam, toelichting: String(x.toelichting || "").slice(0, 300) }));
    for (const g of gewijzigd) if (!raakt.includes(g.id)) raakt.push(g.id);
    return {
      kandidaten,
      koppeling: {
        raakt: raakt.map((id) => {
          const p = perId.get(id)!;
          return { id, naam: p.naam, bronUrl: p.bron_url || null, tools: (p.tools || []).filter((t) => t && t.naam).map((t) => ({ naam: String(t.naam), url: t.url || null })) };
        }),
        mogelijkGewijzigd: gewijzigd,
      },
    };
  } catch (e) {
    return { koppeling: leeg(), kandidaten, fout: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
}
