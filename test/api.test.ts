import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corsToegestaan } from "../lib/motor/config";
import { cronToegestaan } from "../lib/motor/cron-auth";
import { bouwRss } from "../lib/motor/rss";
import { dagStart } from "../lib/motor/tijd";
import { SupabaseOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { publiekBericht, jsonAntwoord, geldigeCategorie } from "../lib/motor/api";
import { CATEGORIEEN } from "../lib/motor/types";

test("CORS: alleen nederlanders.fr, infofrankrijk.com en subdomeinen", () => {
  for (const o of ["https://www.nederlanders.fr", "https://nederlanders.fr", "https://infofrankrijk.com", "https://www.infofrankrijk.com", "https://nieuws.infofrankrijk.com", "https://infopoche.fr"]) assert.equal(corsToegestaan(o), o);
  for (const o of ["https://evil.test", "https://infofrankrijk.com.evil.test", "https://xinfofrankrijk.com", "http://infopoche.fr", "https://infopoche.fr.evil.test", "https://xinfopoche.fr", "https://evil.test/infopoche.fr", "null", "", null]) assert.equal(corsToegestaan(o), null);
  const r = jsonAntwoord(new Request("https://x.test/api/nieuws", { headers: { origin: "https://evil.test" } }), {});
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});

test("cron-route: alleen met het juiste Bearer-geheim, zonder geheim altijd dicht", () => {
  const was = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal(cronToegestaan(new Request("https://x.test", { headers: { authorization: "Bearer " } })), false);
  process.env.CRON_SECRET = "geheim123";
  assert.equal(cronToegestaan(new Request("https://x.test", { headers: { authorization: "Bearer geheim123" } })), true);
  assert.equal(cronToegestaan(new Request("https://x.test", { headers: { authorization: "Bearer fout" } })), false);
  assert.equal(cronToegestaan(new Request("https://x.test")), false);
  if (was === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = was;
});

test("categorieën zijn precies de zeven", () => {
  assert.deepEqual([...CATEGORIEEN], ["algemeen", "politiek", "economie en ondernemen", "reizen en verkeer", "natuur en rampen", "toerisme en evenementen", "merkwaardig"]);
  assert.equal(geldigeCategorie("economie-en-ondernemen"), "economie en ondernemen");
  assert.equal(geldigeCategorie("sport"), undefined);
});

const b: OpgeslagenBericht = {
  id: "11111111-1111-1111-1111-111111111111", kop: "Kop & meer", samenvatting: "Samenvatting", tekst: "Tekst", categorie: "algemeen", score: 70, regime: "pers", status: "gepubliceerd",
  blokkadeRedenen: ["intern"], beeldUrl: null, gepubliceerdOp: "2026-11-23T08:00:00.000Z",
  peil: { raakt: [{ id: "p1", naam: "P1" }], mogelijkGewijzigd: [{ id: "p1", naam: "P1", toelichting: "intern" }] },
  bronnen: [{ naam: "Bron", origineleKop: "Titre", datum: "2026-11-23T07:00:00.000Z", url: "https://a.test/1" }],
};

test("publieke vorm lekt geen interne velden en toont 'wordt nagelopen'", () => {
  const p = publiekBericht(b, true) as Record<string, unknown>;
  assert.ok(!("blokkadeRedenen" in p) && !("score" in p));
  assert.equal((p.peil as { raakt: { wordtNagelopen: boolean }[] }).raakt[0].wordtNagelopen, true);
  assert.ok(!JSON.stringify(p).includes("intern"));
});

test("RSS 2.0 is geldig opgemaakt en escaped", () => {
  const x = bouwRss([b], { basis: "https://nieuws.test/", titel: "T", zelfUrl: "https://x.test/api/rss" });
  assert.ok(x.startsWith('<?xml version="1.0"'));
  assert.ok(x.includes("<title>Kop &amp; meer</title>") && x.includes("<category>algemeen</category>") && x.includes("https://nieuws.test/bericht/1111"));
});

test("dagStart ligt op middernacht Amsterdam", () => {
  assert.equal(dagStart(Date.parse("2026-11-23T10:00:00Z")), "2026-11-22T23:00:00.000Z"); // wintertijd
  assert.equal(dagStart(Date.parse("2026-07-10T10:00:00Z")), "2026-07-09T22:00:00.000Z"); // zomertijd
});

test("Supabase-opslag: juiste REST-verzoeken, fouten worden gegooid", async () => {
  const log: { url: string; method: string; body?: string }[] = [];
  const fetchFn = (async (u: string, init: RequestInit) => {
    log.push({ url: String(u), method: String(init.method || "GET"), body: init.body as string | undefined });
    assert.equal((init.headers as Record<string, string>).apikey, "sleutel");
    if (String(u).includes("nv_berichten?on_conflict")) return new Response(JSON.stringify([{ id: "22222222-2222-2222-2222-222222222222" }]));
    if (String(u).includes("fout")) return new Response("nee", { status: 500 });
    return new Response(JSON.stringify([{ id: "x" }]));
  }) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co/", "sleutel", fetchFn);
  const id = await o.slaBerichtOp({ ...b, sleutel: "s", status: "gepubliceerd", bronnen: b.bronnen });
  assert.equal(id, "22222222-2222-2222-2222-222222222222");
  assert.ok(log.some((l) => l.url.includes("nv_bronnen_per_bericht")));
  assert.ok(log.every((l) => !l.url.includes("news_items")));
  assert.equal(await o.upsertItems([{ url: "https://a.test/1", bronId: "a", bronNaam: "A", regime: "pers", groep: "fr_pers", taal: "fr", land: "FR", titel: "t", samenvatting: "", gepubliceerdOp: "2026-11-23T00:00:00Z" }]), 1);
  assert.equal(await o.bericht("geen-uuid"), null);
  const kapot = new SupabaseOpslag("https://p.supabase.co", "sleutel", (async () => new Response("nee", { status: 500 })) as unknown as typeof fetch);
  await assert.rejects(() => kapot.berichten({ limiet: 5 }));
});

test("migratie: alleen nv_-tabellen, raakt news_items niet, RLS aan", () => {
  const sql = readFileSync("supabase/migrations/20261123120000_nieuwsvoorziening_nv_tabellen.sql", "utf8");
  for (const t of ["nv_bron_items", "nv_berichten", "nv_bronnen_per_bericht", "nv_peil_signalen", "nv_oogst_runs"]) {
    assert.ok(sql.includes(`create table if not exists public.${t}`), t);
    assert.ok(sql.includes(`alter table public.${t} enable row level security`), t);
  }
  assert.ok(!/news_items/.test(sql.replace(/--.*$/gm, "")));
  for (const c of CATEGORIEEN) assert.ok(sql.includes(`'${c}'`), c);
});

test("berichten: peil-filter in geheugen en in het Supabase-verzoek", async () => {
  const { GeheugenOpslag } = await import("../lib/motor/opslag");
  const g = new GeheugenOpslag();
  const basis = { kop: "k", samenvatting: "s", tekst: "t", categorie: "algemeen" as const, score: 70, regime: "pers" as const, status: "gepubliceerd" as const, blokkadeRedenen: [], beeldUrl: null, bronnen: [], gepubliceerdOp: new Date().toISOString(), sleutel: "x" };
  await g.slaBerichtOp({ ...basis, sleutel: "a", peil: { raakt: [], mogelijkGewijzigd: [] } });
  await g.slaBerichtOp({ ...basis, sleutel: "b", peil: { raakt: [{ id: "p", naam: "P" }], mogelijkGewijzigd: [] } });
  assert.equal((await g.berichten({ limiet: 10 })).length, 2);
  assert.equal((await g.berichten({ limiet: 10, peil: true })).length, 1);
  const urls: string[] = [];
  const o = new SupabaseOpslag("https://p.supabase.co", "k", (async (u: string) => { urls.push(String(u)); return new Response("[]"); }) as unknown as typeof fetch);
  await o.berichten({ limiet: 5, peil: true });
  assert.ok(urls[0].includes("or=") && decodeURIComponent(urls[0]).includes("peil_raakt.neq.[],portemonnee.eq.true"));
  // portemonnee-berichten tonen ook zonder PEIL-koppeling
  await g.slaBerichtOp({ ...basis, sleutel: "c", portemonnee: true, peil: { raakt: [], mogelijkGewijzigd: [] } });
  assert.equal((await g.berichten({ limiet: 10, peil: true })).length, 2);
});
