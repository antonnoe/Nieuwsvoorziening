// Herstelronde 1 na PEIL streng (26-11-2026): signalen overschrijven, getallen in NL/FR/EN notatie, logregels,
// groen-filter in het Supabase-verzoek en de eenmalige hertoets van eerder leeggemaakte berichten.
import test from "node:test";
import assert from "node:assert/strict";
import { peilKoppeling } from "../lib/motor/peil";
import { getallen, leesGetal, waardenGelijk } from "../lib/motor/peilbeoordeling";
import { draaiOogst } from "../lib/motor/motor";
import { laadConfig } from "../lib/motor/config";
import { GeheugenOpslag, SupabaseOpslag, signaalOverschrijfbaar, type OpgeslagenBericht } from "../lib/motor/opslag";
import type { PeilParameter, PeilSignaalIn, PeilSignaalRij } from "../lib/motor/types";
import type { ModelClient } from "../lib/motor/ai";

const geenWeb = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
const BER = "44444444-4444-4444-4444-444444444444";

test("getallen: Nederlandse, Franse en Engelse notatie", () => {
  assert.deepEqual(leesGetal("1.897,35"), ["1897.35"]);
  assert.deepEqual(leesGetal("1897,35"), ["1897.35"]);
  assert.deepEqual(leesGetal("1,897.35"), ["1897.35"]);
  assert.deepEqual(leesGetal("1 897,35"), ["1897.35"]);
  assert.deepEqual(leesGetal("1 897,35"), ["1897.35"]);
  assert.deepEqual(leesGetal("1.500"), ["1500"], "Nederlands duizendtal, niet 1,5");
  assert.deepEqual(leesGetal("1 500"), ["1500"]);
  assert.deepEqual(leesGetal("1 500"), ["1500"]);
  assert.deepEqual(leesGetal("0.500"), ["0.5"]);
  assert.deepEqual(leesGetal("1.234.567"), ["1234567"]);
  assert.deepEqual(leesGetal("12,51"), ["12.51"]);
  assert.deepEqual(leesGetal("1,500"), ["1.5", "1500"], "echt dubbelzinnig: beide mogelijkheden");
  assert.equal(getallen("12,51 per uur en 1.897,35 per maand").length, 2);
  assert.equal(waardenGelijk("1.897,35 euro", "1897,35 euro"), true);
  assert.equal(waardenGelijk("ruim 1.500 euro netto", "plus de 1 500 euros net"), true);
  assert.equal(waardenGelijk("12,51 euro bruto per uur", "12,51 per uur en 1.897,35 per maand"), true, "deelverzameling");
  assert.equal(waardenGelijk("1,5 procent", "15 procent"), false);
  assert.equal(waardenGelijk("12,51 euro", "13,00 euro"), false);
  assert.equal(waardenGelijk("12,51 euro", "verhoogd"), false);
});

const P_SMIC: PeilParameter = { id: "p.fr.smic", naam: "SMIC bruto uurloon", trefwoorden: "smic minimumloon uurloon", waarde_weergave: "12,02 euro" };
const P_DPE: PeilParameter = { id: "p.fr.dpe.klassegrenzen", naam: "DPE: klassegrenzen energielabel", trefwoorden: "dpe klassegrenzen energielabel woning verhuur energieslurpend", waarde_weergave: "A tot G" };
const P_HUUR: PeilParameter = { id: "p.fr.huur.decence_dpe_kalender", naam: "Verhuurverbod energieslurpende woningen: kalender", trefwoorden: "verhuurverbod energieslurpende woningen decence dpe kalender", waarde_weergave: "G vanaf 2025" };

test("het minimumloonbericht wordt groen met de twee verschillend geformuleerde waarden", async () => {
  const kop = "Minimumloon in Frankrijk stijgt op 1 december naar ruim 1.500 euro netto";
  const bron = "Smic : le décret actant la hausse à plus de 1 500 euros net au 1er décembre est paru ce jeudi au Journal officiel";
  const klant: ModelClient = {
    async tekst(a) {
      const g = a.model.includes("haiku");
      return JSON.stringify({ raakt: true, soort: "wijziging", nieuweWaarde: g ? "12,51 euro bruto per uur" : "12,51 per uur en 1.897,35 per maand", ingangsdatum: "2026-12-01", definitief: true, citaat: g ? kop : "plus de 1 500 euros net au 1er décembre", titel: "Minimumloon stijgt" });
    },
  };
  const r = await peilKoppeling({ kop, samenvatting: "Het minimumloon gaat omhoog.", tekst: "Het decreet over het minimumloon is verschenen in het Journal officiel." }, bron, [P_SMIC], klant, 6, { publicatie: "2026-11-26T08:00:00.000Z" });
  assert.equal(r.koppeling.raakt.length, 1);
  assert.equal(r.koppeling.raakt[0].zekerheid, "groen");
  assert.equal(r.signalen[0].zekerheid, "groen");
  assert.deepEqual(r.oordelen.map((o) => [o.p, o.a, o.b, o.uitkomst]), [["p.fr.smic", "ja", "ja", "groen"]]);
});

test("verhuurverbod: oranje op de verhuurkalender, nooit op de klassegrenzen", async () => {
  const tekst = "De Nationale Assemblee heeft het verhuurverbod voor energieslurpende woningen uit de woonwet geschrapt. De Senaat heeft nog niet gestemd.";
  const klant: ModelClient = {
    async tekst(a) {
      const dpe = a.user.includes("naam: DPE");
      const g = a.model.includes("haiku");
      if (dpe) return JSON.stringify(g ? { raakt: true, soort: "wijziging", nieuweWaarde: "geschrapt", ingangsdatum: null, definitief: false, citaat: "het verhuurverbod voor energieslurpende woningen", titel: "Energielabel" } : { raakt: false, soort: "alleen_raakt", nieuweWaarde: null, ingangsdatum: null, definitief: null, citaat: "", titel: "" });
      return JSON.stringify({ raakt: true, soort: "wijziging", nieuweWaarde: "verbod geschrapt", ingangsdatum: null, definitief: false, citaat: "het verhuurverbod voor energieslurpende woningen uit de woonwet geschrapt", titel: "Verhuurverbod geschrapt" });
    },
  };
  const r = await peilKoppeling({ kop: "Assemblee schrapt verhuurverbod voor energieslurpende woningen", samenvatting: "", tekst }, "", [P_DPE, P_HUUR], klant, 6, { publicatie: "2026-11-26T08:00:00.000Z" });
  assert.deepEqual(r.koppeling.raakt, [], "oranje komt nooit bij lezers");
  assert.deepEqual(r.signalen.map((s) => [s.parameterId, s.zekerheid]), [["p.fr.huur.decence_dpe_kalender", "oranje"]]);
  const dpe = r.oordelen.find((o) => o.p === P_DPE.id)!;
  assert.deepEqual([dpe.a, dpe.b, dpe.uitkomst], ["ja", "nee", "niets"]);
  const huur = r.oordelen.find((o) => o.p === P_HUUR.id)!;
  assert.equal(huur.uitkomst, "oranje");
  assert.ok(huur.problemen?.some((x) => /definitief/.test(x)));
  assert.ok(!JSON.stringify(r.oordelen).includes("Assemblee"), "geen brontekst in het log");
});

const signaal = (o: Partial<PeilSignaalIn> = {}): PeilSignaalIn => ({ berichtId: BER, parameterId: "p.a", parameterNaam: "A", toelichting: "t", soort: "wijziging", zekerheid: "oranje", titel: "T", nieuweWaarde: "1", huidigeWaarde: null, vanaf: null, definitief: false, twijfel: "x", citaat: "c", bronUrl: null, ...o });
const rij = (o: Partial<PeilSignaalRij>): PeilSignaalRij => ({ ...signaal(), id: "s", status: "gesignaleerd", aantal: 1, besluit: null, besluitOp: null, berichtKop: "", ...o });

test("overschrijfbaar: alleen zonder redactiebesluit", () => {
  assert.equal(signaalOverschrijfbaar({ status: "raakt_niet", besluitOp: null }), true);
  assert.equal(signaalOverschrijfbaar({ status: "afgewezen", besluitOp: null }), true);
  assert.equal(signaalOverschrijfbaar({ status: "gesignaleerd", besluitOp: null }), true);
  assert.equal(signaalOverschrijfbaar({ status: "raakt_niet", besluitOp: "2026-11-26T10:00:00Z" }), false);
  assert.equal(signaalOverschrijfbaar({ status: "vastgesteld", besluitOp: null }), false);
});

test("geheugen: een nieuw signaal overschrijft een oud zonder zekerheid, een besluit van de redactie blijft", async () => {
  const o = new GeheugenOpslag();
  o.signalen.push(rij({ id: "s1", parameterId: "p.a", zekerheid: null as never, status: "raakt_niet" }));
  o.signalen.push(rij({ id: "s2", parameterId: "p.b", status: "raakt_niet", besluit: "raakt_niet", besluitOp: "2026-11-26T10:00:00Z" }));
  o.signalen.push(rij({ id: "s3", parameterId: "p.c", status: "vastgesteld", besluit: "vastgesteld", besluitOp: "2026-11-26T10:00:00Z" }));
  const n = await o.slaPeilSignalenOp([signaal({ parameterId: "p.a" }), signaal({ parameterId: "p.b" }), signaal({ parameterId: "p.c" }), signaal({ parameterId: "p.d" })]);
  assert.equal(n, 2, "overschreven en nieuw, de twee besloten rijen niet");
  const s1 = o.signalen.find((x) => x.id === "s1")!;
  assert.equal(s1.zekerheid, "oranje");
  assert.equal(s1.status, "gesignaleerd");
  assert.equal(o.signalen.find((x) => x.id === "s2")!.status, "raakt_niet");
  assert.equal(o.signalen.find((x) => x.id === "s3")!.status, "vastgesteld");
  assert.equal(o.signalen.length, 4);
  assert.equal((await o.peilSignalen()).length, 2, "s1 en het nieuwe signaal staan open");
});

test("Supabase: overschrijft zonder besluit (PATCH), laat besluiten staan, telt het werkelijk bewaarde aantal", async () => {
  const bestaand = [
    { id: "r1", bericht_id: BER, parameter_id: "p.a", status: "raakt_niet", besluit_op: null, aantal: 1, titel: "" },
    { id: "r2", bericht_id: BER, parameter_id: "p.b", status: "raakt_niet", besluit_op: "2026-11-26T10:00:00Z", aantal: 1, titel: "" },
    { id: "r3", bericht_id: BER, parameter_id: "p.c", status: "lijst", besluit_op: "2026-11-26T10:00:00Z", aantal: 1, titel: "" },
  ];
  const log: { m: string; u: string; b?: string }[] = [];
  let postAntwoord: unknown[] | null = null;
  const f = (async (u: string, init?: RequestInit) => {
    const m = init?.method || "GET", d = decodeURIComponent(String(u));
    log.push({ m, u: d, b: init?.body as string | undefined });
    if (m === "GET") return new Response(JSON.stringify(bestaand));
    if (m === "PATCH") return new Response(JSON.stringify([{ id: "r1" }]));
    return new Response(JSON.stringify(postAntwoord ?? JSON.parse(init!.body as string)));
  }) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co", "k", f);
  const n = await o.slaPeilSignalenOp([signaal({ parameterId: "p.a" }), signaal({ parameterId: "p.b" }), signaal({ parameterId: "p.c" }), signaal({ parameterId: "p.d" })]);
  assert.equal(n, 2);
  const patches = log.filter((l) => l.m === "PATCH");
  assert.equal(patches.length, 1);
  assert.ok(patches[0].u.includes("id=eq.r1"));
  const body = JSON.parse(patches[0].b!);
  assert.equal(body.status, "gesignaleerd");
  assert.equal(body.zekerheid, "oranje");
  assert.equal(body.besluit_op, null);
  const post = log.find((l) => l.m === "POST")!;
  assert.deepEqual(JSON.parse(post.b!).map((x: { parameter_id: string }) => x.parameter_id), ["p.d"]);
  // Negeert de database het nieuwe signaal (conflict), dan wordt het niet meegeteld.
  postAntwoord = [];
  assert.equal(await o.slaPeilSignalenOp([signaal({ parameterId: "p.d" })]), 0);
});

test("Supabase: ontbreekt-signaal blijft uniek per onderwerp, zelfde bericht overschrijft de eigen rij", async () => {
  const titel = "Heffing op tweede woningen";
  const bestaand = [{ id: "r9", bericht_id: BER, parameter_id: "ontbreekt:abc", status: "gesignaleerd", besluit_op: null, aantal: 1, titel }];
  const log: { m: string; u: string; b?: string }[] = [];
  const f = (async (u: string, init?: RequestInit) => {
    const m = init?.method || "GET", d = decodeURIComponent(String(u));
    log.push({ m, u: d, b: init?.body as string | undefined });
    if (m === "GET") return new Response(JSON.stringify(bestaand));
    return new Response(JSON.stringify([{ id: "r9" }]));
  }) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co", "k", f);
  const n = await o.slaPeilSignalenOp([signaal({ soort: "ontbreekt", parameterId: "ontbreekt:abc", titel })]);
  assert.equal(n, 1);
  assert.ok(log.some((l) => l.m === "PATCH" && l.u.includes("id=eq.r9")));
  assert.ok(!log.some((l) => l.m === "POST"), "geen tweede rij");
});

const oud = (id: string, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id, kop: "Minimumloon in Frankrijk stijgt op 1 december naar ruim 1.500 euro netto", samenvatting: "S", tekst: "Het decreet over het minimumloon is verschenen.", categorie: "economie en ondernemen", score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [],
  beeldUrl: null, gepubliceerdOp: new Date().toISOString(), regelversie: 2, handmatigOp: null, peil: { raakt: [], mogelijkGewijzigd: [] },
  bronnen: [{ naam: "Bron", origineleKop: "Smic : le décret actant la hausse", datum: "2026-11-26", url: "https://a.test/1" }], ...o,
});

test("hertoets: leeggemaakte berichten met een oud raakt_niet-signaal worden eenmalig opnieuw getoetst, met bronsamenvatting", async () => {
  const o = new GeheugenOpslag();
  o.berichtenLijst.push(oud("m1"));
  o.berichtenLijst.push(oud("m2")); // leeg, maar zonder signaal: niet opnieuw
  o.berichtenLijst.push(oud("m3")); // leeg, met besluit van de redactie: blijft leeg
  o.signalen.push(rij({ id: "s1", berichtId: "m1", parameterId: "p.fr.smic", zekerheid: null as never, status: "raakt_niet" }));
  o.signalen.push(rij({ id: "s3", berichtId: "m3", parameterId: "p.fr.smic", zekerheid: null as never, status: "raakt_niet", besluit: "raakt_niet", besluitOp: "2026-11-26T10:00:00Z" }));
  o.items.set("https://a.test/1", { url: "https://a.test/1", bronId: "b", bronNaam: "B", regime: "pers", groep: "fr_pers", taal: "fr", land: "FR", titel: "t", samenvatting: "BRONSAMENVATTING-UNIEK", gepubliceerdOp: new Date().toISOString() } as never);
  const prompts: string[] = [];
  const client: ModelClient = {
    async tekst(a) {
      if (a.user.includes("PARAMETER")) prompts.push(a.user);
      return JSON.stringify({ raakt: true, soort: "wijziging", nieuweWaarde: "12,51 euro bruto per uur", ingangsdatum: "2026-12-01", definitief: true, citaat: "Minimumloon in Frankrijk stijgt op 1 december naar ruim 1.500 euro netto", titel: "Minimumloon stijgt" });
    },
  };
  const run = () => draaiOogst({ opslag: o, client, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [P_SMIC], generator: null });
  const r = await run();
  assert.equal(r.aantallen.peilHertoetst, 1);
  assert.equal(o.berichtenLijst.find((b) => b.id === "m1")!.peil.raakt[0]?.zekerheid, "groen");
  assert.deepEqual(o.berichtenLijst.find((b) => b.id === "m3")!.peil.raakt, []);
  assert.ok(prompts[0].includes("BRONSAMENVATTING-UNIEK"), "de samenvatting van de bron gaat mee");
  const st = r.stappen.find((s) => s.stap === "peil_hertoets")!;
  const detail = st.detail as { berichten: { bericht: string; kandidaten: string[]; oordelen: { p: string; a: string; b: string; uitkomst: string }[] }[] };
  assert.equal(detail.berichten.length, 1);
  assert.deepEqual(detail.berichten[0].kandidaten, ["p.fr.smic"]);
  assert.deepEqual([detail.berichten[0].oordelen[0].a, detail.berichten[0].oordelen[0].b, detail.berichten[0].oordelen[0].uitkomst], ["ja", "ja", "groen"]);
  // Het oude signaal is overschreven of afgesloten; het komt niet steeds opnieuw.
  assert.ok(!(await o.teToetsenPeil("2000-01-01", 10)).some((b) => b.id === "m1" || b.id === "m3"));
  const r2 = await run();
  assert.equal(r2.aantallen.peilHertoetst, 0);
});

test("hertoets: zonder uitkomst (niets) komt een leeggemaakt bericht ook niet steeds terug", async () => {
  const o = new GeheugenOpslag();
  o.berichtenLijst.push(oud("m1"));
  o.signalen.push(rij({ id: "s1", berichtId: "m1", parameterId: "p.fr.smic", zekerheid: null as never, status: "raakt_niet" }));
  const client: ModelClient = { async tekst() { return JSON.stringify({ raakt: false, soort: "alleen_raakt", nieuweWaarde: null, ingangsdatum: null, definitief: null, citaat: "", titel: "" }); } };
  const run = () => draaiOogst({ opslag: o, client, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [P_SMIC], generator: null });
  assert.equal((await run()).aantallen.peilHertoetst, 1);
  assert.equal(o.signalen[0].status, "afgewezen");
  assert.equal((await run()).aantallen.peilHertoetst, 0);
});

test("Supabase: teToetsenPeil haalt ook berichten met een oud raakt_niet-signaal zonder besluit; sluiten gaat op afgewezen", async () => {
  const log: { m: string; u: string; b?: string }[] = [];
  const bericht = { id: BER, kop: "k", samenvatting: "s", tekst: "t", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkade_redenen: [], gepubliceerd_op: new Date().toISOString(), peil_raakt: [], peil_mogelijk_gewijzigd: [], nv_bronnen_per_bericht: [] };
  const f = (async (u: string, init?: RequestInit) => {
    const m = init?.method || "GET", d = decodeURIComponent(String(u));
    log.push({ m, u: d, b: init?.body as string | undefined });
    if (d.includes("nv_peil_signalen") && m === "GET") return new Response(JSON.stringify([{ bericht_id: BER }]));
    if (d.includes("nv_berichten?id=in.")) return new Response(JSON.stringify([bericht]));
    return new Response("[]");
  }) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co", "k", f);
  const lijst = await o.teToetsenPeil("2026-11-01T00:00:00Z", 10);
  assert.deepEqual(lijst.map((b) => b.id), [BER]);
  const sigQ = log.find((l) => l.u.includes("nv_peil_signalen"))!;
  assert.ok(sigQ.u.includes("zekerheid=is.null") && sigQ.u.includes("status=eq.raakt_niet") && sigQ.u.includes("besluit_op=is.null"));
  await o.sluitOudePeilSignalen(BER);
  const p = log.find((l) => l.m === "PATCH")!;
  assert.ok(p.u.includes("besluit_op=is.null") && p.u.includes("status=in.(gesignaleerd,raakt_niet)"));
  assert.equal(JSON.parse(p.b!).status, "afgewezen");
});

test("Supabase: ?peil=1 valt terug op het oude filter met groen-filter achteraf als de database de nieuwe syntaxis weigert", async () => {
  const urls: string[] = [];
  const mk = (id: string, raakt: unknown[], portemonnee = false) => ({ id, kop: "k", samenvatting: "s", tekst: "t", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkade_redenen: [], gepubliceerd_op: new Date().toISOString(), portemonnee, peil_raakt: raakt, peil_mogelijk_gewijzigd: [], nv_bronnen_per_bericht: [] });
  const f = (async (u: string) => {
    const d = decodeURIComponent(String(u));
    urls.push(d);
    if (d.includes("peil_raakt.cs.")) return new Response(JSON.stringify({ code: "22P02", message: "syntax" }), { status: 400 });
    return new Response(JSON.stringify([mk("a", [{ id: "x", naam: "X" }]), mk("b", [{ id: "x", naam: "X", zekerheid: "groen" }]), mk("c", [], true)]));
  }) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co", "k", f);
  const r = await o.berichten({ limiet: 10, peil: true });
  assert.deepEqual(r.map((b) => b.id).sort(), ["b", "c"], "een koppeling zonder zekerheid telt niet");
});

test("logregel per kandidaat: tweede model niet gevraagd als het eerste nee zegt", async () => {
  // De logregel komt uit peilKoppeling; hier alleen de vorm voor een niet-gevraagd tweede model.
  const klant: ModelClient = { async tekst() { return JSON.stringify({ raakt: false, soort: "alleen_raakt", nieuweWaarde: null, ingangsdatum: null, definitief: null, citaat: "", titel: "" }); } };
  const r = await peilKoppeling({ kop: "Minimumloon stijgt", samenvatting: "", tekst: "Het minimumloon stijgt." }, "", [P_SMIC], klant, 6, { publicatie: "2026-11-26T08:00:00.000Z" });
  assert.deepEqual(r.oordelen, [{ p: "p.fr.smic", a: "nee", b: "-", uitkomst: "niets" }]);
});
