import test from "node:test";
import assert from "node:assert/strict";
import { maakUnsplashGenerator, MAX_AANVRAGEN_PER_RUN } from "../lib/motor/beeld-unsplash";
import { beeldResultaat, schoneZoektermen, noemtPersoon } from "../lib/motor/beeld";
import { TERUGVAL } from "../lib/motor/beeld-terugval";
import { CATEGORIEEN } from "../lib/motor/types";
import type { ModelClient } from "../lib/motor/ai";

const mk = (id: string, alt: string) => ({ id, alt_description: alt, description: null, urls: { regular: `https://images.unsplash.com/${id}` }, links: { download_location: `https://api.unsplash.com/photos/${id}/download` }, user: { name: "Marie Dupont", links: { html: "https://unsplash.com/@marie" } } });
const invoer = { kop: "Overstromingen in de Gironde", samenvatting: "Straten staan onder water.", categorie: "natuur en rampen" as const };
const modelMet = (antwoord: string): ModelClient => ({ tekst: async () => antwoord });

function nepUnsplash(opties: { zoek?: unknown[][]; status?: number } = {}) {
  const log: string[] = [];
  let n = 0;
  const f = (async (u: string) => {
    const url = String(u);
    log.push(url);
    if (opties.status) return new Response("", { status: opties.status });
    if (url.includes("/search/photos")) return new Response(JSON.stringify({ results: (opties.zoek || [[]])[Math.min(n++, (opties.zoek || [[]]).length - 1)] }), { status: 200 });
    const m = url.match(/\/photos\/([^/?]+)$/);
    if (m) return new Response(JSON.stringify(mk(m[1], "a quiet village street")), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { f, log };
}

test("pasvorm boven de drempel: de gekozen zoekfoto, met download-melding en bronvermelding", async () => {
  const { f, log } = nepUnsplash({ zoek: [[mk("a1", "a flooded street"), mk("a2", "a lighthouse")]] });
  const g = maakUnsplashGenerator(f, () => "test");
  const r = await beeldResultaat({ ...invoer, zoektermen: ["flooded street", "heavy rain river"], client: modelMet('{"keuze":1,"cijfer":8}') }, g);
  assert.equal(r?.url, "https://images.unsplash.com/a1?w=1200&q=75");
  assert.equal(r?.credit?.maker, "Marie Dupont");
  assert.match(String(r?.credit?.makerUrl), /utm_source=nieuwsvoorziening/);
  assert.ok(log.some((u) => u.includes("query=flooded+street")));
  assert.ok(log.some((u) => u.endsWith("/photos/a1/download")), "download-eindpunt moet worden aangeroepen");
  assert.equal(log.length, 2, "één zoekopdracht en één melding");
});

test("pasvorm onder de drempel: alle termen geprobeerd, dan vaste terugval (geen zoekfoto)", async () => {
  const { f, log } = nepUnsplash({ zoek: [[mk("x1", "mont saint michel")]] });
  const g = maakUnsplashGenerator(f, () => "test");
  const r = await beeldResultaat({ ...invoer, zoektermen: ["flooded street", "heavy rain river", "wet road"], client: modelMet('{"keuze":1,"cijfer":3}') }, g);
  const ids = TERUGVAL["natuur en rampen"].map((t) => t.id);
  assert.ok(r, "er is een terugval");
  assert.ok(ids.some((id) => r!.url.split("?")[0].endsWith(id)), "terugvalfoto uit het vaste bestand");
  assert.ok(!r!.url.split("?")[0].endsWith("x1"));
  assert.equal(log.filter((u) => u.includes("/search/photos")).length, 3);
  assert.ok(log.some((u) => /\/photos\/[^/]+$/.test(u)), "terugvalfoto via GET /photos/:id");
  assert.ok(log.some((u) => u.endsWith("/download")), "download-melding bij de terugval");
});

test("zonder model geen oordeel: terugval in plaats van een gok", async () => {
  const { f } = nepUnsplash({ zoek: [[mk("x1", "flooded street")]] });
  const r = await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client: null }, maakUnsplashGenerator(f, () => "test"));
  assert.ok(r && !r.url.split("?")[0].endsWith("x1"));
});

test("onleesbaar modelantwoord telt als 'past niet'", async () => {
  const { f } = nepUnsplash({ zoek: [[mk("x1", "flooded street")]] });
  const r = await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client: modelMet("geen idee") }, maakUnsplashGenerator(f, () => "test"));
  assert.ok(r && !r.url.split("?")[0].endsWith("x1"));
});

test("geen sleutel: geen beeld en geen enkele aanvraag", async () => {
  const { f, log } = nepUnsplash();
  assert.equal(await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client: modelMet('{"keuze":1,"cijfer":9}') }, maakUnsplashGenerator(f, () => "")), null);
  assert.equal(log.length, 0);
});

test("403 en 429: netjes null, daarna geen nieuwe aanvragen tot de volgende run", async () => {
  for (const status of [403, 429]) {
    const { f, log } = nepUnsplash({ status });
    const g = maakUnsplashGenerator(f, () => "test");
    assert.equal(await beeldResultaat({ ...invoer, zoektermen: ["flooded street", "wet road"], client: modelMet('{"keuze":1,"cijfer":9}') }, g), null);
    assert.equal(await beeldResultaat(invoer, g), null);
    assert.equal(log.length, 1, `HTTP ${status}: na de eerste weigering geen aanvraag meer`);
    g.startRun?.();
    await beeldResultaat({ ...invoer, zoektermen: ["flooded street"] }, g);
    assert.equal(log.length, 2, "nieuwe run, nieuwe kans");
  }
});

test("aanvraagbudget per run is een harde grens onder de 40", async () => {
  assert.ok(MAX_AANVRAGEN_PER_RUN <= 38);
  const { f, log } = nepUnsplash({ zoek: [[mk("x1", "flooded street")]] });
  const g = maakUnsplashGenerator(f, () => "test", 7);
  for (let i = 0; i < 10; i++) await beeldResultaat({ ...invoer, kop: `bericht ${i}`, zoektermen: ["flooded street", "wet road", "heavy rain"], client: modelMet('{"keuze":1,"cijfer":9}') }, g);
  assert.equal(log.length, 7);
  assert.equal(g.aanvragen(), 7);
});

test("nooit een persoon: zoektermen zonder namen en foto's met personen vallen af", async () => {
  assert.deepEqual(schoneZoektermen(["Emmanuel Macron speech", "politician at podium", "man walking street", "government building", "flooded street"]), ["government building", "flooded street"]);
  assert.deepEqual(schoneZoektermen(["flooded France village", "x"]), ["flooded france village"]);
  assert.deepEqual(schoneZoektermen("airplane factory"), ["airplane factory"]);
  assert.ok(noemtPersoon("a woman walking in the rain") && !noemtPersoon("a flooded street"));
  const { f, log } = nepUnsplash({ zoek: [[mk("p1", "a man standing in a flooded street")]] });
  const keuzes: string[] = [];
  const client: ModelClient = { tekst: async (a) => (keuzes.push(a.user), '{"keuze":1,"cijfer":9}') };
  const r = await beeldResultaat({ ...invoer, zoektermen: ["Macron visits flood", "flooded street"], client }, maakUnsplashGenerator(f, () => "test"));
  assert.ok(!keuzes.some((k) => k.includes("man standing")), "foto met persoon komt niet bij het model");
  assert.ok(!log.some((u) => u.includes("Macron")));
  assert.ok(r && !r.url.endsWith("p1"));
});

test("terugvalbestand: elke categorie heeft foto's, ids uniek per categorie", () => {
  for (const c of CATEGORIEEN) {
    const l = TERUGVAL[c];
    assert.ok(l.length >= 2, c);
    assert.equal(new Set(l.map((t) => t.id)).size, l.length);
  }
});

test("lichte url: breedte 1200 en kwaliteit 75, bestaande parameters worden vervangen", async () => {
  const { lichteUrl } = await import("../lib/motor/beeld-unsplash");
  const u = new URL(lichteUrl("https://images.unsplash.com/photo-1?ixid=abc&q=80&w=1080"));
  assert.equal(u.searchParams.get("w"), "1200");
  assert.equal(u.searchParams.get("q"), "75");
  assert.equal(u.searchParams.getAll("w").length, 1);
  assert.equal(u.searchParams.get("ixid"), "abc");
});

test("nooit dezelfde foto twee keer: een al gebruikte foto wordt overgeslagen, ook de terugval, en de gekozen foto komt in de set", async () => {
  const { fotoSleutel } = await import("../lib/motor/beeld");
  const { f } = nepUnsplash({ zoek: [[mk("a1", "a flooded street"), mk("a2", "a flooded road")]] });
  const vermijd = new Set<string>([fotoSleutel("https://images.unsplash.com/a1?w=800&q=60")]);
  const r = await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client: modelMet('{"keuze":1,"cijfer":9}'), vermijd }, maakUnsplashGenerator(f, () => "test"));
  assert.ok(r && r.url.split("?")[0].endsWith("a2"), "a1 is al gebruikt, dus a2");
  assert.ok(vermijd.has(fotoSleutel(r!.url)));
  const tweede = await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client: modelMet('{"keuze":1,"cijfer":9}'), vermijd }, maakUnsplashGenerator(nepUnsplash({ zoek: [[mk("a1", "x"), mk("a2", "y")]] }).f, () => "test"));
  assert.ok(!tweede || !/\/a[12]$/.test(tweede.url.split("?")[0]), "geen van beide foto's nog eens");
});
