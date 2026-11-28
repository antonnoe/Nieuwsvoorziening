// Signaal voor InfoPoche ("Let op", 27-11-2026): parsing, API-vorm, fallback zonder kolommen en de nalooprun.
import test from "node:test";
import assert from "node:assert/strict";
import { leesSynthese, SYSTEEM_SYNTHESE } from "../lib/motor/synthese";
import { beoordeelSignaal } from "../lib/motor/signaal";
import { leesSignaal } from "../lib/motor/types";
import { publiekBericht } from "../lib/motor/api";
import { draaiOogst } from "../lib/motor/motor";
import { laadConfig, MAX_SIGNAAL_NALOOP_PER_RUN } from "../lib/motor/config";
import { GeheugenOpslag, SupabaseOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import type { ModelClient } from "../lib/motor/ai";

const geenWeb = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
const BER = "55555555-5555-5555-5555-555555555555";
const tekst = Array(60).fill("woord").join(" ");

const synth = (extra: Record<string, unknown>) => JSON.stringify({ publiceren: true, kop: "Kop", samenvatting: "S", tekst, categorie: "algemeen", relevantie: 80, ...extra });

test("leesSignaal: alleen wetswijziging en kans, al het andere is null", () => {
  assert.equal(leesSignaal("wetswijziging"), "wetswijziging");
  assert.equal(leesSignaal("kans"), "kans");
  assert.equal(leesSignaal(" Kans "), "kans");
  for (const v of ["", "waarschuwing", "null", null, undefined, 1, true, {}, ["kans"]]) assert.equal(leesSignaal(v), null);
});

test("synthese: het veld signaal wordt gelezen en gevalideerd; onbekend of ontbrekend is null", () => {
  assert.equal(leesSynthese(synth({ signaal: "wetswijziging" }))!.signaal, "wetswijziging");
  assert.equal(leesSynthese(synth({ signaal: "kans" }))!.signaal, "kans");
  assert.equal(leesSynthese(synth({ signaal: "nieuws" }))!.signaal, null);
  assert.equal(leesSynthese(synth({ signaal: null }))!.signaal, null);
  assert.equal(leesSynthese(synth({}))!.signaal, null);
  assert.ok(SYSTEEM_SYNTHESE.includes('"signaal":null') && SYSTEEM_SYNTHESE.includes("wetswijziging") && SYSTEEM_SYNTHESE.includes("kans"));
});

const bericht = (o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id: BER, kop: "Kop", samenvatting: "S", tekst: "T", categorie: "algemeen", score: 70, regime: "pers", status: "gepubliceerd", blokkadeRedenen: ["intern"], beeldUrl: null,
  gepubliceerdOp: new Date().toISOString(), peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], ...o,
});

test("API: signaal staat achteraan in de publieke vorm, ongeldige waarde en ontbrekend geven null, geen interne velden erbij", () => {
  const p = publiekBericht(bericht({ signaal: "wetswijziging", signaalBeoordeeld: true }), false) as Record<string, unknown>;
  const sleutels = Object.keys(p);
  assert.equal(sleutels[sleutels.length - 2], "signaal");
  assert.equal(sleutels[sleutels.length - 1], "beeldPng");
  assert.equal(p.signaal, "wetswijziging");
  assert.ok(!("signaalBeoordeeld" in p));
  assert.equal((publiekBericht(bericht(), true) as Record<string, unknown>).signaal, null);
  assert.equal((publiekBericht(bericht({ signaal: "onzin" as never }), true) as Record<string, unknown>).signaal, null);
  // de bestaande velden blijven op hun plek
  assert.deepEqual(sleutels.slice(0, 5), ["id", "kop", "samenvatting", "categorie", "portemonnee"]);
});

test("Supabase zonder kolommen: opslaan, lezen en nalooprun blijven werken", async () => {
  const log: { m: string; u: string; b?: string }[] = [];
  const f = (async (u: string, init?: RequestInit) => {
    const m = init?.method || "GET", d = decodeURIComponent(String(u)), b = init?.body as string | undefined;
    log.push({ m, u: d, b });
    const metSignaal = (b || "").includes("signaal") || d.includes("signaal_beoordeeld");
    if (metSignaal) return new Response(JSON.stringify({ code: "PGRST204", message: "Could not find the 'signaal' column of 'nv_berichten' in the schema cache" }), { status: 400 });
    if (m === "POST" && d.includes("nv_berichten?on_conflict")) return new Response(JSON.stringify([{ id: BER }]));
    return new Response("[]");
  }) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co", "k", f);
  const id = await o.slaBerichtOp({ kop: "k", samenvatting: "s", tekst: "t", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [], beeldUrl: null, peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], gepubliceerdOp: new Date().toISOString(), sleutel: "s1", signaal: "kans", signaalBeoordeeld: true });
  assert.equal(id, BER);
  const posts = log.filter((l) => l.m === "POST");
  assert.ok(posts[0].b!.includes("signaal"), "eerst met signaal");
  assert.ok(!posts[posts.length - 1].b!.includes("signaal"), "dan zonder");
  // een tweede opslag probeert het niet opnieuw (vlag), en de nalooprun levert niets
  const voor = log.length;
  await o.slaBerichtOp({ kop: "k2", samenvatting: "s", tekst: "t", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [], beeldUrl: null, peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], gepubliceerdOp: new Date().toISOString(), sleutel: "s2", signaalBeoordeeld: true });
  assert.ok(log.slice(voor).filter((l) => l.m === "POST").every((l) => !l.b!.includes("signaal")));
  assert.deepEqual(await o.teBeoordelenSignaal("2026-11-01T00:00:00Z", 15), []);
  await o.zetSignaal(BER, "kans"); // geen fout
  // lezen zonder kolommen: select=* geeft geen signaalvelden, dat is gewoon null
  const rij = { id: BER, kop: "k", samenvatting: "s", tekst: "t", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", gepubliceerd_op: new Date().toISOString(), nv_bronnen_per_bericht: [] };
  const o2 = new SupabaseOpslag("https://p.supabase.co", "k", (async () => new Response(JSON.stringify([rij]))) as unknown as typeof fetch);
  const lijst = await o2.berichten({ limiet: 5 });
  assert.equal(lijst[0].signaal, null);
  assert.equal(lijst[0].signaalBeoordeeld, false);
});

test("Supabase met kolommen: nalooprun vraagt alleen onbeoordeelde gepubliceerde berichten en schrijft het oordeel weg", async () => {
  const log: { m: string; u: string; b?: string }[] = [];
  const rij = { id: BER, kop: "k", samenvatting: "s", tekst: "t", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", gepubliceerd_op: new Date().toISOString(), signaal: null, signaal_beoordeeld: false, nv_bronnen_per_bericht: [] };
  const weg = { ...rij, id: "66666666-6666-6666-6666-666666666666", redactie: "weg" };
  const f = (async (u: string, init?: RequestInit) => {
    log.push({ m: init?.method || "GET", u: decodeURIComponent(String(u)), b: init?.body as string | undefined });
    return new Response(init?.method === "PATCH" ? "" : JSON.stringify([rij, weg]));
  }) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co", "k", f);
  const lijst = await o.teBeoordelenSignaal("2026-11-01T00:00:00Z", 15);
  assert.deepEqual(lijst.map((b) => b.id), [BER], "een bericht met redactie weg valt af");
  assert.ok(log[0].u.includes("status=eq.gepubliceerd") && log[0].u.includes("signaal_beoordeeld=eq.false") && log[0].u.includes("limit=15"));
  await o.zetSignaal(BER, "wetswijziging");
  const patch = log.find((l) => l.m === "PATCH")!;
  assert.deepEqual(JSON.parse(patch.b!), { signaal: "wetswijziging", signaal_beoordeeld: true });
});

const nieuw = (id: string, o: Partial<OpgeslagenBericht> = {}) => bericht({ id, kop: `Kop ${id}`, ...o });
const oogst = (opslag: GeheugenOpslag, client: ModelClient) => draaiOogst({ opslag, client, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [], generator: null });

test("nalooprun: selectie (14 dagen, gepubliceerd, onbeoordeeld, niet weg) en plafond van 15", async () => {
  const o = new GeheugenOpslag();
  const dag = 86400_000;
  o.berichtenLijst.push(nieuw("a", { gepubliceerdOp: new Date(Date.now() - 2 * dag).toISOString() }));
  o.berichtenLijst.push(nieuw("oud", { gepubliceerdOp: new Date(Date.now() - 20 * dag).toISOString() }));
  o.berichtenLijst.push(nieuw("al", { signaalBeoordeeld: true, signaal: null }));
  o.berichtenLijst.push(nieuw("concept", { status: "concept" }));
  o.berichtenLijst.push(nieuw("weg", { redactie: "weg" }));
  const sinds = new Date(Date.now() - 14 * dag).toISOString();
  assert.deepEqual((await o.teBeoordelenSignaal(sinds, 15)).map((b) => b.id), ["a"].sort(), "alleen a");
  for (let n = 0; n < 20; n++) o.berichtenLijst.push(nieuw(`x${n}`));
  assert.equal((await o.teBeoordelenSignaal(sinds, MAX_SIGNAAL_NALOOP_PER_RUN)).length, 15);
  assert.equal(MAX_SIGNAAL_NALOOP_PER_RUN, 15);
});

test("nalooprun: oordeel wordt gezet, null is ook een oordeel, modelfout laat het bericht onbeoordeeld", async () => {
  const o = new GeheugenOpslag();
  o.berichtenLijst.push(nieuw("w", { kop: "Verhuurverbod geschrapt" }), nieuw("n", { kop: "Staking bij de spoorwegen" }), nieuw("f", { kop: "Foutgeval" }), nieuw("x", { kop: "Onbekend" }));
  const modellen: string[] = [];
  const client: ModelClient = {
    async tekst(a) {
      modellen.push(a.model);
      if (a.user.includes("Verhuurverbod")) return '{"signaal":"wetswijziging"}';
      if (a.user.includes("Staking")) return '{"signaal":null}';
      if (a.user.includes("Onbekend")) return '{"signaal":"waarschuwing"}';
      throw new Error("modelfout");
    },
  };
  const r = await oogst(o, client);
  const per = (id: string) => o.berichtenLijst.find((b) => b.id === id)!;
  assert.equal(per("w").signaal, "wetswijziging");
  assert.equal(per("w").signaalBeoordeeld, true);
  assert.equal(per("n").signaal, null);
  assert.equal(per("n").signaalBeoordeeld, true, "null is beoordeeld");
  assert.equal(per("x").signaal, null);
  assert.equal(per("x").signaalBeoordeeld, true, "onbekende waarde wordt null");
  assert.notEqual(per("f").signaalBeoordeeld, true, "modelfout: niets gezet");
  assert.equal(r.aantallen.signaalBeoordeeld, 3);
  assert.ok(modellen.every((m) => m === (process.env.NIEUWS_MODEL_GOEDKOOP || "claude-haiku-4-5")), "goedkope model");
  // volgende run: alleen de mislukte komt terug
  const r2 = await oogst(o, { async tekst() { return '{"signaal":"kans"}'; } });
  assert.equal(r2.aantallen.signaalBeoordeeld, 1);
  assert.equal(per("f").signaal, "kans");
});

test("beoordeelSignaal: antwoord zonder bruikbaar JSON-veld is een fout (null), niet 'geen signaal'", async () => {
  const c = (t: string): ModelClient => ({ async tekst() { return t; } });
  assert.equal(await beoordeelSignaal({ kop: "k", samenvatting: "s", tekst: "t" }, c("geen idee")), null);
  assert.equal(await beoordeelSignaal({ kop: "k", samenvatting: "s", tekst: "t" }, c('{"iets":1}')), null);
  assert.deepEqual(await beoordeelSignaal({ kop: "k", samenvatting: "s", tekst: "t" }, c('```json\n{"signaal":"kans"}\n```')), { signaal: "kans" });
});
