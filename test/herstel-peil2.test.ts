// Herstelronde 2 (27-11-2026): voorselectie met familiegrens en naamwegingen, apart budget per model, "overgeslagen" in het log,
// en de eenmalige hertoets. Met ECHTE berichtteksten uit nv_berichten (fixture, SELECT 27-11-2026) en de echte PEIL-export
// (momentopname van https://communitiesabroad.com/manifest/peil-zoek.json, stand 2026-11-15, versie 1.18.6).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { peilKoppeling, peilVoorselectie, peilFamilie, MAX_PER_FAMILIE, MAX_GOEDKOOP_AANROEPEN, MAX_SYNTHESE_AANROEPEN } from "../lib/motor/peil";
import { draaiOogst } from "../lib/motor/motor";
import { laadConfig } from "../lib/motor/config";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import type { PeilParameter } from "../lib/motor/types";
import type { ModelClient } from "../lib/motor/ai";

const PEIL = (JSON.parse(readFileSync(new URL("./fixtures/peil-export-2026-11-27.json", import.meta.url), "utf8")) as { parameters: PeilParameter[] }).parameters;
const BERICHTEN = JSON.parse(readFileSync(new URL("./fixtures/echte-berichten-2026-11.json", import.meta.url), "utf8")) as Record<string, { kop: string; samenvatting: string; tekst: string; gepubliceerdOp: string; categorie: string }>;
const SMIC_ID = "523a0d4d-be78-44fc-badc-43b540fe30a1";
const VERHUUR_ID = "55fdeaca-d7e7-4973-bb23-e4086fbbd107";
const SMIC = BERICHTEN[SMIC_ID];
const VERHUUR = BERICHTEN[VERHUUR_ID];

const nee = { raakt: false, soort: "alleen_raakt", nieuweWaarde: null, ingangsdatum: null, definitief: null, citaat: "", titel: "" };
const geenWeb = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;

/** Nepmodel dat per parameter-id antwoordt (het id staat niet in de prompt, wel de naam); telt aanroepen per model. */
function nep(per: (naam: string, model: string, system: string) => Record<string, unknown>): ModelClient & { n: { g: number; s: number } } {
  const n = { g: 0, s: 0 };
  return {
    n,
    async tekst(a) {
      if (a.model.includes("haiku")) n.g += 1; else n.s += 1;
      const naam = /naam: (.*)/.exec(a.user)?.[1] ?? "";
      return JSON.stringify(per(naam, a.model, a.system));
    },
  };
}

test("echte PEIL-export: de momentopname is geladen", () => {
  assert.ok(PEIL.length >= 300);
  assert.ok(PEIL.some((p) => p.id === "p.fr.sociaal.smic") && PEIL.some((p) => p.id === "p.fr.huur.decence_dpe_kalender"));
});

test("familie: id tot de laatste punt", () => {
  assert.equal(peilFamilie("p.fr.dpe.klassegrenzen"), "p.fr.dpe");
  assert.equal(peilFamilie("los"), "los");
});

test("echt bericht verhuurverbod (55fdeaca): decence_dpe_kalender is kandidaat, hooguit 2 per familie", () => {
  const k = peilVoorselectie(`${VERHUUR.kop} ${VERHUUR.tekst}`, PEIL, MAX_GOEDKOOP_AANROEPEN);
  const ids = k.map((p) => p.id);
  assert.ok(ids.includes("p.fr.huur.decence_dpe_kalender"), `kandidaten: ${ids.join(", ")}`);
  assert.ok(ids.indexOf("p.fr.huur.decence_dpe_kalender") < 4, `moet bij de top: ${ids.join(", ")}`);
  const perFamilie = new Map<string, number>();
  for (const id of ids) perFamilie.set(peilFamilie(id), (perFamilie.get(peilFamilie(id)) || 0) + 1);
  for (const [f, n] of perFamilie) assert.ok(n <= MAX_PER_FAMILIE, `familie ${f} heeft ${n}`);
  assert.ok(ids.length <= MAX_GOEDKOOP_AANROEPEN);
});

test("echt bericht verhuurverbod: nooit klassegrenzen als uitkomst, wel een signaal op decence_dpe_kalender", async () => {
  // Fout nepmodel: het goedkope model zegt bij elke DPE-parameter ja (zoals voorheen); het synthesemodel is streng.
  const client = nep((naam, model) => {
    if (naam.includes("Verhuurverbod naar DPE-klasse")) return { raakt: true, soort: "wijziging", nieuweWaarde: "verhuurverbod volledig geschrapt", ingangsdatum: null, definitief: false, citaat: "amendement aannamen dat het stapsgewijze verhuurverbod voor energieslurpende woningen volledig schrapt", titel: "Verhuurverbod voor energieslurpende woningen" };
    if (model.includes("haiku") && /DPE/.test(naam)) return { raakt: true, soort: "wijziging", nieuweWaarde: "x", ingangsdatum: null, definitief: false, citaat: "energieprestatiecertificaat (DPE)", titel: "DPE" };
    return nee;
  });
  const r = await peilKoppeling({ kop: VERHUUR.kop, samenvatting: VERHUUR.samenvatting, tekst: VERHUUR.tekst }, "", PEIL, client, 8, { publicatie: VERHUUR.gepubliceerdOp });
  assert.ok(!r.koppeling.raakt.some((x) => x.id.startsWith("p.fr.dpe.")), "geen DPE-technische parameter gekoppeld");
  assert.ok(!r.signalen.some((x) => x.parameterId === "p.fr.dpe.klassegrenzen"), "nooit klassegrenzen als uitkomst");
  const s = r.signalen.find((x) => x.parameterId === "p.fr.huur.decence_dpe_kalender");
  assert.ok(s, "signaal op decence_dpe_kalender");
  assert.equal(s!.zekerheid, "oranje", "definitief onbekend (commissie en stemming volgen): oranje, niet groen");
  assert.ok(client.n.s <= MAX_SYNTHESE_AANROEPEN && client.n.g <= MAX_GOEDKOOP_AANROEPEN);
});

test("echt bericht minimumloon (523a0d4d): smic is kandidaat en wordt groen met het nepmodel", async () => {
  const k = peilVoorselectie(`${SMIC.kop} ${SMIC.tekst}`, PEIL, MAX_GOEDKOOP_AANROEPEN).map((p) => p.id);
  assert.ok(k.includes("p.fr.sociaal.smic"), `kandidaten: ${k.join(", ")}`);
  const client = nep((naam) => naam.startsWith("SMIC")
    ? { raakt: true, soort: "wijziging", nieuweWaarde: "12,51 euro bruto per uur", ingangsdatum: "2026-12-01", definitief: true, citaat: "wettelijk minimumloon (smic) per 1 december omhooggaat", titel: "Minimumloon stijgt" }
    : nee);
  const r = await peilKoppeling({ kop: SMIC.kop, samenvatting: SMIC.samenvatting, tekst: SMIC.tekst }, "", PEIL, client, 8, { publicatie: SMIC.gepubliceerdOp, ontbreekt: true });
  assert.deepEqual(r.koppeling.raakt.map((x) => [x.id, x.zekerheid]), [["p.fr.sociaal.smic", "groen"]]);
  assert.ok(r.signalen.some((x) => x.parameterId === "p.fr.sociaal.smic" && x.zekerheid === "groen"));
});

test("kandidaat zonder budget wordt gelogd als overgeslagen (synthesemodel: hooguit 3)", async () => {
  const params: PeilParameter[] = ["aardbei", "brandnetel", "citroen", "dadel", "eikel"].map((w, i) => ({ id: `p.fr.fam${i}.x`, naam: `Zeldzaam ${w}regeling`, trefwoorden: `${w}regeling`, waarde_weergave: "1" }));
  const tekst = params.map((p) => `${p.trefwoorden} komt voor`).join(". ");
  const client = nep((_n, model) => (model.includes("haiku") ? { raakt: true, soort: "alleen_raakt", nieuweWaarde: null, ingangsdatum: null, definitief: null, citaat: "x", titel: "t" } : nee));
  const r = await peilKoppeling({ kop: "Kop over regelingen", tekst }, "", params, client, 8, { publicatie: "2026-11-26T00:00:00Z" });
  assert.equal(r.kandidaten.length, 5);
  assert.equal(client.n.g, 5);
  assert.equal(client.n.s, MAX_SYNTHESE_AANROEPEN);
  assert.equal(r.oordelen.filter((o) => o.uitkomst === "overgeslagen").length, 2);
});

test("'ontbreekt in PEIL' heeft een eigen aanroep, ook bij een vol kandidatenbudget", async () => {
  const params: PeilParameter[] = Array.from({ length: 8 }, (_, i) => ({ id: `p.fr.f${i}.x`, naam: `Zeldzaam w${i}woordregeling`, trefwoorden: `w${i}woordregeling`, waarde_weergave: "1" }));
  const tekst = params.map((p) => `${p.trefwoorden} komt voor`).join(". ");
  const systemen: string[] = [];
  const client = nep((_n, _m, system) => (systemen.push(system), nee));
  const r = await peilKoppeling({ kop: "Kop over regelingen", tekst }, "", params, client, 8, { publicatie: "2026-11-26T00:00:00Z", ontbreekt: true });
  assert.equal(r.kandidaten.length, 8);
  assert.equal(client.n.g, 9, "8 kandidaten plus de ontbreekt-controle");
  assert.ok(r.oordelen.some((o) => o.p === "ontbreekt"));
});

test("eenmalige hertoets: 55fdeaca wordt opnieuw getoetst, signaal op decence_dpe_kalender, telt mee in aantallen en komt daarna niet terug", async () => {
  const o = new GeheugenOpslag();
  const b: OpgeslagenBericht = {
    id: VERHUUR_ID, kop: VERHUUR.kop, samenvatting: VERHUUR.samenvatting, tekst: VERHUUR.tekst, categorie: "politiek", score: 70, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [],
    beeldUrl: null, gepubliceerdOp: VERHUUR.gepubliceerdOp, regelversie: 2, handmatigOp: null, peil: { raakt: [], mogelijkGewijzigd: [] },
    bronnen: [{ naam: "Bron", origineleKop: "Logement: l'Assemblée supprime l'interdiction de louer", datum: "2026-11-24", url: "https://a.test/1" }],
  } as OpgeslagenBericht;
  o.berichtenLijst.push(b);
  o.signalen.push({ id: "s1", berichtId: VERHUUR_ID, parameterId: "p.fr.dpe.klassegrenzen", parameterNaam: "DPE", soort: "wijziging", zekerheid: null, status: "afgewezen", titel: "t", toelichting: "t", aantal: 1 } as never);
  const client = nep((naam) => naam.includes("Verhuurverbod naar DPE-klasse")
    ? { raakt: true, soort: "wijziging", nieuweWaarde: "verhuurverbod volledig geschrapt", ingangsdatum: null, definitief: false, citaat: "amendement aannamen dat het stapsgewijze verhuurverbod voor energieslurpende woningen volledig schrapt", titel: "Verhuurverbod voor energieslurpende woningen" }
    : nee);
  const run = () => draaiOogst({ opslag: o, client, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: PEIL, generator: null, nu: new Date("2026-11-27T10:00:00Z").getTime() } as never);
  const r = await run();
  assert.equal(r.aantallen.peilHertoetst, 1);
  assert.ok(Number(r.aantallen.peilSignalen) >= 1 && Number(r.aantallen.peilSignalenHertoets) >= 1, "hertoetssignalen tellen mee");
  const s = o.signalen.find((x) => x.berichtId === VERHUUR_ID && x.parameterId === "p.fr.huur.decence_dpe_kalender");
  assert.ok(s && s.zekerheid === "oranje");
  assert.equal((await run()).aantallen.peilHertoetst, 0, "niet nog eens");
});
