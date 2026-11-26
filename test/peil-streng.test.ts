// PEIL streng (26-11-2026): twee controles, zekerheid groen/oranje, lezers zien alleen groen, ontbreekt in PEIL,
// signalen voor de redactie en de eenmalige hertoets. Met een nepmodel dat per model antwoordt.
import test from "node:test";
import assert from "node:assert/strict";
import { peilKoppeling, MAX_PEIL_AANROEPEN } from "../lib/motor/peil";
import { beoordeel, citaatAanwezig, datumInVerleden, leesControle, waardenGelijk, zoekSamenvoeging, ontbreektSleutel, type Controle } from "../lib/motor/peilbeoordeling";
import { draaiOogst } from "../lib/motor/motor";
import { laadConfig } from "../lib/motor/config";
import { GeheugenOpslag, isPeilKolomFout, SupabaseOpslag, MigratieOntbreekt, type OpgeslagenBericht } from "../lib/motor/opslag";
import { groenePeil, type Bericht, type PeilParameter, type PeilSignaalIn } from "../lib/motor/types";
import { publiekBericht, wisOpslagCache } from "../lib/motor/api";
import { GET as redGET, POST as redPOST } from "../app/api/redactie/route";
import { leesOpdracht, peilVorm, wisRem } from "../lib/redactie";
import type { ModelClient } from "../lib/motor/ai";
import { klein } from "./helpers";

type Antwoord = Record<string, unknown> | "kapot";
/** Nepmodel: antwoordt per modelnaam (haiku = goedkoop, sonnet = synthese) en telt de aanroepen. */
function nep(goedkoop: Antwoord | Antwoord[], synth: Antwoord | Antwoord[]): ModelClient & { n: { goedkoop: number; synth: number } } {
  const n = { goedkoop: 0, synth: 0 };
  const kies = (a: Antwoord | Antwoord[], i: number) => (Array.isArray(a) ? a[Math.min(i, a.length - 1)] : a);
  return {
    n,
    async tekst(a) {
      const g = a.model.includes("haiku");
      const x = kies(g ? goedkoop : synth, g ? n.goedkoop++ : n.synth++);
      if (x === "kapot") throw new Error("modelfout");
      return JSON.stringify(x);
    },
  };
}
const ja = (o: Record<string, unknown> = {}): Antwoord => ({ raakt: true, soort: "wijziging", nieuweWaarde: "1,5 procent", ingangsdatum: "2027-01-01", definitief: true, citaat: "de CSG gaat omhoog naar 1,5 procent", titel: "Sociale heffing op inkomen", ...o });
const nee: Antwoord = { raakt: false, soort: "alleen_raakt", nieuweWaarde: null, ingangsdatum: null, definitief: null, citaat: "", titel: "" };

const P_DPE: PeilParameter = { id: "p.fr.dpe.klassegrenzen", naam: "DPE: klassegrenzen energielabel", trefwoorden: "dpe klassegrenzen energielabel woning verhuur energieslurpend", waarde_weergave: "A tot G", bron_url: "https://x.test/dpe" };
const P_SMIC: PeilParameter = { id: "p.fr.smic", naam: "SMIC bruto uurloon", trefwoorden: "smic minimumloon uurloon", waarde_weergave: "12,02 euro", tools: [{ naam: "Loontool", url: "https://t.test" }] };
const P_CSG: PeilParameter = { id: "p.fr.csg", naam: "CSG tarief", trefwoorden: "csg sociale heffing", waarde_weergave: "9,2 procent" };

const VERHUUR = {
  kop: "Nationale Assemblee schrapt verhuurverbod voor energieslurpende woningen uit woonwet",
  tekst: "De Nationale Assemblee heeft het verhuurverbod voor energieslurpende woningen uit de woonwet geschrapt. Het tijdpad van het verbod verandert daardoor.",
};
const PUB = "2026-11-20T08:00:00.000Z";

// ---- Toetsgeval 1: het verhuurverbod hangt niet aan de klassegrenzen --------------------------------
test("toetsgeval: het bericht over het verhuurverbod wordt niet aan de DPE-klassegrenzen gekoppeld", async () => {
  // Het goedkope model zegt (zoals voorheen) ja, het synthesemodel nee: geen koppeling, geen signaal.
  const c = nep(ja({ citaat: "verhuurverbod voor energieslurpende woningen", nieuweWaarde: "geschrapt" }), nee);
  const r = await peilKoppeling(VERHUUR, "", [P_DPE], c, 6, { publicatie: PUB });
  assert.equal(r.kandidaten.length, 1, "de voorselectie vindt de klassegrenzen wel (daarom twee controles)");
  assert.deepEqual(r.koppeling.raakt, []);
  assert.deepEqual(r.signalen, []);
  assert.equal(c.n.goedkoop, 1);
  assert.equal(c.n.synth, 1);
  // Zegt alleen het goedkope model nee, dan wordt het synthesemodel niet eens gevraagd.
  const c2 = nep(nee, ja());
  const r2 = await peilKoppeling(VERHUUR, "", [P_DPE], c2, 6, { publicatie: PUB });
  assert.deepEqual(r2.koppeling.raakt, []);
  assert.equal(c2.n.synth, 0);
});

// ---- Toetsgeval 2: SMIC-signaal met een datum in het verleden is hooguit oranje -----------------------
test("toetsgeval: een signaal met ingangsdatum in het verleden is hooguit oranje en nooit voor lezers", async () => {
  const smic = ja({ nieuweWaarde: "12,02 euro", ingangsdatum: "2024-12-01", citaat: "het minimumloon SMIC stijgt per 1 december", titel: "Minimumloon in Frankrijk" });
  const c = nep(smic, smic);
  const r = await peilKoppeling(
    { kop: "Minimumloon SMIC stijgt", tekst: "Het minimumloon SMIC stijgt per 1 december naar 12,02 euro per uur. Het gaat om het bruto uurloon." },
    "", [P_SMIC], c, 6, { publicatie: "2026-11-12T08:00:00.000Z", bronUrl: "https://bron.test/1" }
  );
  assert.deepEqual(r.koppeling.raakt, [], "oranje komt niet bij lezers");
  assert.equal(r.signalen.length, 1);
  assert.equal(r.signalen[0].zekerheid, "oranje");
  assert.match(r.signalen[0].twijfel || "", /verleden/);
  assert.match(r.signalen[0].twijfel || "", /1 december 2024/);
});

// ---- Groen, oranje, niets ----------------------------------------------------------------------------
const CSG = { kop: "CSG gaat omhoog", tekst: "Het kabinet bevestigt: de CSG gaat omhoog naar 1,5 procent per 1 januari 2027. De sociale heffing geldt ook voor inwoners met buitenlands inkomen." };

test("groen: beide controles ja, letterlijk citaat, gelijke waarde en datum, toekomstige datum, definitief", async () => {
  const c = nep(ja(), ja({ nieuweWaarde: "1.5 procent", citaat: "De CSG gaat omhoog naar 1,5 procent" }));
  const r = await peilKoppeling(CSG, "", [P_CSG], c, 6, { publicatie: PUB, bronUrl: "https://bron.test/1" });
  assert.equal(r.koppeling.raakt.length, 1);
  assert.equal(r.koppeling.raakt[0].zekerheid, "groen");
  assert.equal(r.koppeling.mogelijkGewijzigd.length, 1);
  assert.equal(r.signalen.length, 1);
  assert.equal(r.signalen[0].zekerheid, "groen");
  assert.equal(r.signalen[0].soort, "wijziging");
  assert.equal(r.signalen[0].huidigeWaarde, "9,2 procent");
  assert.equal(r.signalen[0].bronUrl, "https://bron.test/1");
  assert.equal(r.signalen[0].twijfel, null);
  assert.equal(r.aanroepen, 2);
});

test("oranje: niet definitief, of citaat niet letterlijk, of verschillende waarden; nooit een koppeling voor lezers", async () => {
  const voorlopig = await peilKoppeling(CSG, "", [P_CSG], nep(ja({ definitief: false }), ja({ definitief: false })), 6, { publicatie: PUB });
  assert.deepEqual(voorlopig.koppeling.raakt, []);
  assert.equal(voorlopig.signalen[0].zekerheid, "oranje");
  assert.match(voorlopig.signalen[0].twijfel || "", /definitief/);
  const verzonnen = await peilKoppeling(CSG, "", [P_CSG], nep(ja(), ja({ citaat: "de CSG verdwijnt volledig in 2030" })), 6, { publicatie: PUB });
  assert.equal(verzonnen.signalen[0].zekerheid, "oranje");
  assert.match(verzonnen.signalen[0].twijfel || "", /letterlijk/);
  const ander = await peilKoppeling(CSG, "", [P_CSG], nep(ja(), ja({ nieuweWaarde: "2,5 procent" })), 6, { publicatie: PUB });
  assert.equal(ander.signalen[0].zekerheid, "oranje");
  assert.deepEqual(ander.koppeling.raakt, []);
});

test("geen signaal: één controle nee, modelfout (fail closed), onleesbaar antwoord, geen client", async () => {
  const een = await peilKoppeling(CSG, "", [P_CSG], nep(ja(), nee), 6, { publicatie: PUB });
  assert.deepEqual([een.koppeling.raakt, een.signalen], [[], []]);
  const kapot = await peilKoppeling(CSG, "", [P_CSG], nep("kapot", ja()), 6, { publicatie: PUB });
  assert.deepEqual([kapot.koppeling.raakt, kapot.signalen], [[], []]);
  assert.ok(kapot.fout);
  const kapot2 = await peilKoppeling(CSG, "", [P_CSG], nep(ja(), "kapot"), 6, { publicatie: PUB });
  assert.deepEqual([kapot2.koppeling.raakt, kapot2.signalen], [[], []]);
  const onzin = await peilKoppeling(CSG, "", [P_CSG], klein(["onzin"]), 6, { publicatie: PUB });
  assert.deepEqual([onzin.koppeling.raakt, onzin.signalen], [[], []]);
  const zonder = await peilKoppeling(CSG, "", [P_CSG], null, 6, { publicatie: PUB });
  assert.deepEqual([zonder.koppeling.raakt, zonder.signalen, zonder.aanroepen], [[], [], 0]);
});

test("alleen raakt (geen wijziging): groen geeft een koppeling zonder signaal", async () => {
  const a = ja({ soort: "alleen_raakt", nieuweWaarde: null, ingangsdatum: null, definitief: null });
  const r = await peilKoppeling(CSG, "", [P_CSG], nep(a, a), 6, { publicatie: PUB });
  assert.equal(r.koppeling.raakt.length, 1);
  assert.deepEqual(r.koppeling.mogelijkGewijzigd, []);
  assert.deepEqual(r.signalen, []);
});

test("kosten: nooit meer dan 6 modelaanroepen per bericht", async () => {
  const veel: PeilParameter[] = Array.from({ length: 6 }, (_, i) => ({ id: `p.${i}`, naam: `CSG tarief ${i}`, trefwoorden: "csg sociale heffing", waarde_weergave: "x" }));
  const c = nep(ja({ definitief: false }), ja({ definitief: false }));
  const r = await peilKoppeling(CSG, "", veel, c, 6, { publicatie: PUB });
  assert.ok(r.aanroepen <= MAX_PEIL_AANROEPEN);
  assert.ok(c.n.goedkoop + c.n.synth <= 6);
});

// ---- Zuivere beoordeling ---------------------------------------------------------------------------------
const ctl = (o: Partial<Controle> = {}): Controle => ({ raakt: true, soort: "wijziging", nieuweWaarde: "10 procent", ingangsdatum: "2027-01-01", definitief: true, citaat: "tarief stijgt naar 10 procent", titel: "t", ...o });
const TEKST = "Het tarief stijgt naar 10 procent per 1 januari 2027.";
test("beoordeel: groen, oranje, null", () => {
  const ctx = { tekst: TEKST, publicatie: PUB };
  assert.equal(beoordeel(ctl(), ctl(), ctx)?.zekerheid, "groen");
  assert.equal(beoordeel(ctl(), ctl({ raakt: false }), ctx), null);
  assert.equal(beoordeel(ctl({ raakt: false }), ctl(), ctx), null);
  assert.equal(beoordeel(ctl({ ingangsdatum: "2024-12-01" }), ctl({ ingangsdatum: "2024-12-01" }), ctx)?.zekerheid, "oranje");
  assert.equal(beoordeel(ctl({ ingangsdatum: "2027-01-01" }), ctl({ ingangsdatum: "2027-02-01" }), ctx)?.zekerheid, "oranje");
  assert.equal(beoordeel(ctl({ soort: "alleen_raakt" }), ctl(), ctx)?.zekerheid, "oranje");
  assert.equal(beoordeel(ctl({ nieuweWaarde: null }), ctl(), ctx)?.zekerheid, "oranje");
  assert.equal(beoordeel(ctl({ citaat: "" }), ctl(), ctx)?.zekerheid, "oranje");
});

test("jaarcontrole, citaat, waarden en lezen van het antwoord", () => {
  assert.equal(datumInVerleden("2024-12-01", PUB), true);
  assert.equal(datumInVerleden("2026", PUB), false);
  assert.equal(datumInVerleden("2025", PUB), true);
  assert.equal(datumInVerleden("2026-11", PUB), false);
  assert.equal(datumInVerleden("2026-10", PUB), true);
  assert.equal(datumInVerleden("2026-11-19", PUB), true);
  assert.equal(datumInVerleden("2026-11-20", PUB), false);
  assert.equal(datumInVerleden("morgen", PUB), null);
  assert.equal(citaatAanwezig("De CSG gaat OMHOOG, naar 1,5 procent!", "...de csg gaat omhoog naar 1,5 procent per januari"), true);
  assert.equal(citaatAanwezig("de csg … 1,5 procent", "de csg gaat omhoog naar 1,5 procent"), true);
  assert.equal(citaatAanwezig("iets anders dat niet staat", "de csg gaat omhoog"), false);
  assert.equal(citaatAanwezig("csg omhoog", "csg omhoog"), false, "minder dan drie woorden telt niet");
  assert.equal(waardenGelijk("1,5 procent", "1.50 %"), true);
  assert.equal(waardenGelijk("1,5 procent", "15 procent"), false);
  assert.equal(leesControle({ raakt: "ja" }), null, "alleen een echte true telt");
  assert.equal(leesControle({ raakt: true, soort: "wijziging", ingangsdatum: "null" })?.ingangsdatum, null);
});

// ---- Ontbreekt in PEIL --------------------------------------------------------------------------------------
const OB = { kop: "Nieuwe heffing op tweede woningen", tekst: "Het kabinet voert een heffing in op tweede woningen van buitenlanders: 0,5 procent van de woningwaarde per jaar, vanaf 1 januari 2027." };
const ob = (o: Record<string, unknown> = {}): Antwoord => ({ ontbreekt: true, soort: "wijziging", nieuweWaarde: "0,5 procent", ingangsdatum: "2027-01-01", definitief: true, citaat: "heffing in op tweede woningen van buitenlanders", titel: "Heffing op tweede woningen", ...o });

test("ontbreekt in PEIL: groen signaal met titel in gewone taal; alleen als de portemonnee geraakt wordt", async () => {
  const c = nep(ob(), ob());
  const r = await peilKoppeling(OB, "", [P_CSG], c, 6, { publicatie: PUB, ontbreekt: true });
  assert.deepEqual(r.koppeling.raakt, []);
  assert.equal(r.signalen.length, 1);
  assert.equal(r.signalen[0].soort, "ontbreekt");
  assert.equal(r.signalen[0].zekerheid, "groen");
  assert.equal(r.signalen[0].titel, "Heffing op tweede woningen");
  assert.ok(r.signalen[0].parameterId.startsWith("ontbreekt:"));
  const zonder = await peilKoppeling(OB, "", [P_CSG], nep(ob(), ob()), 6, { publicatie: PUB });
  assert.deepEqual(zonder.signalen, [], "zonder ontbreekt-vlag geen controle");
  const oranje = await peilKoppeling(OB, "", [P_CSG], nep(ob(), ob({ citaat: "iets dat er niet staat in het bericht" })), 6, { publicatie: PUB, ontbreekt: true });
  assert.equal(oranje.signalen[0].zekerheid, "oranje");
  const een = await peilKoppeling(OB, "", [P_CSG], nep(ob(), { ontbreekt: false }), 6, { publicatie: PUB, ontbreekt: true });
  assert.deepEqual(een.signalen, []);
});

test("dubbele ontbreekt-signalen over hetzelfde onderwerp worden samengevoegd met een teller", async () => {
  const o = new GeheugenOpslag();
  const maak = (berichtId: string, titel: string): PeilSignaalIn => ({
    berichtId, parameterId: ontbreektSleutel(titel), parameterNaam: titel, toelichting: "", soort: "ontbreekt", zekerheid: "groen", titel, nieuweWaarde: null, huidigeWaarde: null, vanaf: null, definitief: true, twijfel: null, citaat: null, bronUrl: null,
  });
  await o.slaPeilSignalenOp([maak("b1", "Heffing op tweede woningen")]);
  await o.slaPeilSignalenOp([maak("b2", "Heffing op tweede woningen")]);
  await o.slaPeilSignalenOp([maak("b3", "Nieuwe heffing tweede woningen")]);
  await o.slaPeilSignalenOp([maak("b4", "Minimumloon in Frankrijk")]);
  assert.equal(o.signalen.length, 2);
  assert.equal(o.signalen[0].aantal, 3);
  assert.equal(zoekSamenvoeging("Heffing tweede woningen", "x", o.signalen)?.berichtId, "b1");
});

// ---- Lezers zien alleen groen -----------------------------------------------------------------------------------
test("lezers: oude en oranje koppelingen verdwijnen uit de publieke vorm en uit het peil-filter", async () => {
  const basis: Omit<Bericht, "peil" | "sleutel"> = { kop: "K", samenvatting: "S", tekst: "T", categorie: "algemeen", score: 80, regime: "pers", soort: "pers", status: "gepubliceerd", blokkadeRedenen: [], beeldUrl: null, bronnen: [], gepubliceerdOp: PUB };
  const o = new GeheugenOpslag();
  await o.slaBerichtOp({ ...basis, sleutel: "oud", peil: { raakt: [{ id: "p1", naam: "P1" }], mogelijkGewijzigd: [] } });
  await o.slaBerichtOp({ ...basis, sleutel: "groen", peil: { raakt: [{ id: "p1", naam: "P1", zekerheid: "groen" }], mogelijkGewijzigd: [] } });
  assert.equal((await o.berichten({ limiet: 10, peil: true })).length, 1);
  const lijst = await o.berichten({ limiet: 10 });
  const pub = publiekBericht(lijst.find((b) => b.peil.raakt.some((r) => !r.zekerheid))!, false) as { peil: { raakt: unknown[] } };
  assert.equal(pub.peil.raakt.length, 0, "een oude koppeling zonder zekerheid is onzichtbaar");
  const metGroen = lijst.find((b) => b.peil.raakt.some((r) => r.zekerheid === "groen"))!;
  const g = publiekBericht(metGroen, false) as { peil: { raakt: Record<string, unknown>[] } };
  assert.equal(g.peil.raakt.length, 1);
  assert.ok(!("zekerheid" in g.peil.raakt[0]), "de publieke vorm blijft ongewijzigd");
  assert.deepEqual(groenePeil([{ zekerheid: "groen" }, {}, { zekerheid: "oranje" }]).length, 1);
});

// ---- Motor: signalen en hertoets -----------------------------------------------------------------------------------
const geenWeb = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
const oud = (id: string, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id, kop: "Nationale Assemblee schrapt verhuurverbod voor energieslurpende woningen uit woonwet", samenvatting: "S", tekst: VERHUUR.tekst, categorie: "politiek", score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [],
  beeldUrl: null, gepubliceerdOp: new Date().toISOString(), regelversie: 2, handmatigOp: null,
  peil: { raakt: [{ id: P_DPE.id, naam: P_DPE.naam }], mogelijkGewijzigd: [{ id: P_DPE.id, naam: P_DPE.naam, toelichting: "x" }] },
  bronnen: [{ naam: "Bron", origineleKop: "verhuurverbod geschrapt", datum: PUB, url: "https://a.test/1" }], ...o,
});

test("hertoets: de oude foute koppeling verdwijnt bij de eerstvolgende oogst, oude signalen worden gesloten, goede koppeling blijft", async () => {
  const o = new GeheugenOpslag();
  o.berichtenLijst.push(oud("m1"));
  o.berichtenLijst.push(oud("m2", { kop: "CSG gaat omhoog", tekst: CSG.tekst, peil: { raakt: [{ id: P_CSG.id, naam: P_CSG.naam }], mogelijkGewijzigd: [] }, bronnen: [{ naam: "B", origineleKop: "CSG omhoog", datum: PUB, url: "https://b.test/1" }] }));
  o.signalen.push({ berichtId: "m1", parameterId: P_DPE.id, parameterNaam: "x", toelichting: "x", soort: "wijziging", zekerheid: null as never, titel: "", nieuweWaarde: null, huidigeWaarde: null, vanaf: null, definitief: null, twijfel: null, citaat: null, bronUrl: null, id: "s0", status: "gesignaleerd", aantal: 1, besluit: null, besluitOp: null, berichtKop: "" });
  const goed = ja({ soort: "alleen_raakt", nieuweWaarde: null, ingangsdatum: null, definitief: null });
  const client: ModelClient = { async tekst(a) { return JSON.stringify(a.user.includes("DPE") ? nee : a.user.includes("CSG") ? goed : { groepen: [] }); } };
  const r = await draaiOogst({ opslag: o, client, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [P_DPE, P_CSG], generator: null });
  const m1 = o.berichtenLijst.find((b) => b.id === "m1")!, m2 = o.berichtenLijst.find((b) => b.id === "m2")!;
  assert.deepEqual(m1.peil.raakt, [], "de fout gekoppelde klassegrenzen zijn weg");
  assert.deepEqual(m1.peil.mogelijkGewijzigd, []);
  assert.equal(m2.peil.raakt.length, 1);
  assert.equal(m2.peil.raakt[0].zekerheid, "groen");
  assert.equal(o.signalen.find((s) => s.id === "s0")!.status, "raakt_niet");
  assert.equal(r.aantallen.peilHertoetst, 2);
  // Tweede oogst: niets meer te toetsen.
  const r2 = await draaiOogst({ opslag: o, client, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [P_DPE, P_CSG], generator: null });
  assert.equal(r2.aantallen.peilHertoetst, 0);
});

test("hertoets: bij een modelfout blijft het bericht voor de volgende run staan", async () => {
  const o = new GeheugenOpslag();
  o.berichtenLijst.push(oud("m1"));
  const client: ModelClient = { async tekst(a) { if (a.user.includes("DPE")) throw new Error("storing"); return JSON.stringify({ groepen: [] }); } };
  await draaiOogst({ opslag: o, client, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [P_DPE], generator: null });
  assert.equal(o.berichtenLijst[0].peil.raakt.length, 1);
  assert.equal((await o.teToetsenPeil("2000-01-01", 10)).length, 1);
});

// ---- Redactie-API ----------------------------------------------------------------------------------------------------
const SIG = "33333333-3333-3333-3333-333333333333";
const BER = "44444444-4444-4444-4444-444444444444";
const bearer = { authorization: "Bearer geheim-test" };
type Log = { methode: string; url: string; body?: string };

async function metNepSupabase<T>(f: (log: Log[]) => Promise<T>, opties: { zonderMigratie?: boolean } = {}): Promise<T> {
  const echt = globalThis.fetch;
  const was = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET, process.env.REDACTIE_SECRET];
  Object.assign(process.env, { SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "dienstsleutel", CRON_SECRET: "geheim-test" });
  delete process.env.REDACTIE_SECRET;
  const log: Log[] = [];
  const rij = { id: SIG, bericht_id: BER, parameter_id: "p.fr.csg", parameter_naam: "CSG tarief", toelichting: "t", status: "gesignaleerd", soort: "wijziging", zekerheid: "oranje", titel: "Sociale heffing", nieuwe_waarde: "1,5 procent", huidige_waarde: "9,2 procent", vanaf: "2027-01-01", definitief: false, twijfel: "Nog niet zeker.", citaat: "c", bron_url: "https://bron.test/1", aantal: 1, besluit: null, besluit_op: null, nv_berichten: { kop: "CSG gaat omhoog" } };
  const bericht = { id: BER, kop: "CSG gaat omhoog", samenvatting: "S", tekst: "T", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkade_redenen: [], gepubliceerd_op: PUB, peil_raakt: [{ id: "p.fr.csg", naam: "CSG", zekerheid: "groen" }, { id: "p.x", naam: "X", zekerheid: "groen" }], peil_mogelijk_gewijzigd: [{ id: "p.fr.csg", naam: "CSG", toelichting: "t" }], nv_bronnen_per_bericht: [] };
  globalThis.fetch = (async (u: string, init?: RequestInit) => {
    const d = decodeURIComponent(String(u));
    log.push({ methode: init?.method || "GET", url: d, body: init?.body as string | undefined });
    if (opties.zonderMigratie && d.includes("nv_peil_signalen")) return new Response(JSON.stringify({ code: "42703", message: 'column nv_peil_signalen.zekerheid does not exist' }), { status: 400 });
    if (d.includes("nv_peil_signalen") && (init?.method || "GET") === "GET") return new Response(JSON.stringify([rij]));
    if (d.includes("nv_berichten?id=eq.")) return new Response(JSON.stringify([bericht]));
    if (d.includes("nv_berichten")) return new Response(JSON.stringify([]));
    if (d.includes("nv_oogst_runs")) return new Response(JSON.stringify([]));
    return new Response("[]");
  }) as typeof fetch;
  wisRem();
  wisOpslagCache();
  try {
    return await f(log);
  } finally {
    globalThis.fetch = echt;
    wisOpslagCache();
    [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET, process.env.REDACTIE_SECRET] = was;
    for (const [i, k] of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "REDACTIE_SECRET"].entries()) if (was[i] === undefined) delete process.env[k];
  }
}
const post = (body: unknown) => redPOST(new Request("https://x.test/api/redactie", { method: "POST", headers: { ...bearer, "content-type": "application/json" }, body: JSON.stringify(body) }));

test("GET /api/redactie levert het veld peil achteraan, in gewone taal zonder PEIL-ids", async () => {
  await metNepSupabase(async () => {
    const r = await redGET(new Request("https://x.test/api/redactie?dagen=2", { headers: bearer }));
    const j = (await r.json()) as Record<string, unknown> & { peil: Record<string, unknown>[] };
    assert.equal(r.status, 200);
    assert.equal(Object.keys(j).at(-1), "peil", "achteraan toegevoegd");
    assert.equal(j.peil.length, 1);
    assert.deepEqual(j.peil[0], { id: SIG, soort: "wijziging", zekerheid: "oranje", titel: "Sociale heffing", huidige: "9,2 procent", nieuw: "1,5 procent", vanaf: "2027-01-01", twijfel: "Nog niet zeker.", berichtId: BER, berichtKop: "CSG gaat omhoog", bronUrl: "https://bron.test/1", aantal: 1, advies: "verwacht" });
    assert.ok(!JSON.stringify(j.peil).includes("p.fr"));
  });
  const vorm = peilVorm({ id: "i", berichtId: "b", parameterId: "x", parameterNaam: "x", toelichting: "", soort: "ontbreekt", zekerheid: "groen", titel: "T", nieuweWaarde: null, huidigeWaarde: null, vanaf: null, definitief: true, twijfel: null, citaat: null, bronUrl: null, status: "gesignaleerd", aantal: 3, besluit: null, besluitOp: null, berichtKop: "K" });
  assert.equal(vorm.advies, "lijst");
  assert.equal(peilVorm({ soort: "wijziging", definitief: true } as never).advies, "vastgesteld");
});

test("POST actie peil: zet de status; raakt_niet haalt de koppeling ook bij het bericht weg; PEIL zelf wordt nooit aangeraakt", async () => {
  await metNepSupabase(async (log) => {
    const r = await post({ actie: "peil", id: SIG, keuze: "raakt_niet" });
    assert.equal(r.status, 200);
    const patches = log.filter((l) => l.methode === "PATCH");
    assert.equal(patches.length, 2);
    assert.ok(patches[0].url.includes(`nv_peil_signalen?id=eq.${SIG}`));
    assert.equal(JSON.parse(patches[0].body!).status, "raakt_niet");
    assert.ok(JSON.parse(patches[0].body!).besluit_op);
    const nieuw = JSON.parse(patches[1].body!) as { peil_raakt: { id: string }[]; peil_mogelijk_gewijzigd: unknown[] };
    assert.deepEqual(nieuw.peil_raakt.map((x) => x.id), ["p.x"]);
    assert.deepEqual(nieuw.peil_mogelijk_gewijzigd, []);
    assert.ok(log.every((l) => !l.url.includes("peil-zoek")), "PEIL niet gelezen of geschreven");
  });
  await metNepSupabase(async (log) => {
    assert.equal((await post({ actie: "peil", id: SIG, keuze: "vastgesteld" })).status, 200);
    assert.equal(log.filter((l) => l.methode === "PATCH").length, 1, "andere keuzes laten het bericht ongemoeid");
    assert.equal((await post({ actie: "peil", id: SIG, keuze: "onzin" })).status, 400);
    assert.equal((await post({ actie: "peil", id: SIG })).status, 400);
  });
  assert.deepEqual(leesOpdracht({ actie: "peil", id: SIG, keuze: "lijst" }), { opdracht: { id: SIG, actie: "peil", keuze: "lijst" } });
});

test("zonder migratie: GET geeft een lege peil-lijst, POST peil geeft 503, opslaan van signalen slaat niets op", async () => {
  await metNepSupabase(async () => {
    const g = await redGET(new Request("https://x.test/api/redactie", { headers: bearer }));
    assert.equal(g.status, 200);
    assert.deepEqual(((await g.json()) as { peil: unknown[] }).peil, []);
    assert.equal((await post({ actie: "peil", id: SIG, keuze: "lijst" })).status, 503);
  }, { zonderMigratie: true });
  assert.ok(isPeilKolomFout(new Error("Supabase POST nv_peil_signalen: HTTP 400 {\"code\":\"PGRST204\",\"message\":\"Could not find the 'zekerheid' column\"}")));
  assert.ok(isPeilKolomFout(new Error('Supabase PATCH nv_peil_signalen: HTTP 400 new row for relation "nv_peil_signalen" violates check constraint 23514')));
  assert.ok(!isPeilKolomFout(new Error("Supabase GET nv_berichten: HTTP 500")));
  const f = (async () => new Response(JSON.stringify({ code: "PGRST204", message: "Could not find the 'zekerheid' column of 'nv_peil_signalen'" }), { status: 400 })) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co", "k", f);
  const s: PeilSignaalIn = { berichtId: BER, parameterId: "p", parameterNaam: "P", toelichting: "", soort: "wijziging", zekerheid: "groen", titel: "T", nieuweWaarde: null, huidigeWaarde: null, vanaf: null, definitief: true, twijfel: null, citaat: null, bronUrl: null };
  assert.equal(await o.slaPeilSignalenOp([s]), 0);
  await assert.rejects(() => o.zetPeilBesluit(SIG, "lijst"), MigratieOntbreekt);
});
