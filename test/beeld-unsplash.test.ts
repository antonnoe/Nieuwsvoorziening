import test from "node:test";
import assert from "node:assert/strict";
import { maakUnsplashGenerator, MAX_AANVRAGEN_PER_RUN } from "../lib/motor/beeld-unsplash";
import { beeldResultaat, schoneZoektermen, noemtPersoon } from "../lib/motor/beeld";
import { ILLUSTRATIES } from "../lib/motor/illustraties";
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

test("pasvorm onder de drempel: alle termen geprobeerd, dan een eigen illustratie (geen zoekfoto)", async () => {
  const { f, log } = nepUnsplash({ zoek: [[mk("x1", "mont saint michel")]] });
  const g = maakUnsplashGenerator(f, () => "test");
  const r = await beeldResultaat({ ...invoer, zoektermen: ["flooded street", "heavy rain river", "wet road"], client: modelMet('{"keuze":1,"cijfer":3}') }, g);
  assert.ok(r, "er is een illustratie");
  assert.equal(r!.credit?.bron, "Illustratie");
  assert.match(r!.url, /^https:\/\/nieuws\.infofrankrijk\.com\/illustraties\/natuur-.*\.svg$/);
  assert.equal(log.filter((u) => u.includes("/search/photos")).length, 3);
  assert.ok(!log.some((u) => /\/photos\/[^/]+$/.test(u)), "geen vaste Unsplash-terugvalfoto meer");
  assert.ok(!log.some((u) => u.endsWith("/download")), "geen download-melding bij een illustratie");
});

test("zonder model geen oordeel: illustratie in plaats van een gok", async () => {
  const { f } = nepUnsplash({ zoek: [[mk("x1", "flooded street")]] });
  const r = await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client: null }, maakUnsplashGenerator(f, () => "test"));
  assert.ok(r && r.credit?.bron === "Illustratie");
});

test("onleesbaar modelantwoord telt als 'past niet'", async () => {
  const { f } = nepUnsplash({ zoek: [[mk("x1", "flooded street")]] });
  const r = await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client: modelMet("geen idee") }, maakUnsplashGenerator(f, () => "test"));
  assert.ok(r && r.credit?.bron === "Illustratie");
});

test("geen sleutel: geen Unsplash-aanvraag, wel een illustratie", async () => {
  const { f, log } = nepUnsplash();
  const r0 = await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client: modelMet('{"keuze":1,"cijfer":9}') }, maakUnsplashGenerator(f, () => ""));
  assert.equal(r0?.credit?.bron, "Illustratie");
  assert.equal(log.length, 0);
});

test("403 en 429: netjes null, daarna geen nieuwe aanvragen tot de volgende run", async () => {
  for (const status of [403, 429]) {
    const { f, log } = nepUnsplash({ status });
    const g = maakUnsplashGenerator(f, () => "test");
    assert.equal((await beeldResultaat({ ...invoer, zoektermen: ["flooded street", "wet road"], client: modelMet('{"keuze":1,"cijfer":9}') }, g))?.credit?.bron, "Illustratie", `HTTP ${status}: illustratie`);
    assert.equal((await beeldResultaat(invoer, g))?.credit?.bron, "Illustratie");
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

test("illustratieset: elke categorie heeft beelden en de ids zijn uniek", () => {
  assert.ok(ILLUSTRATIES.beelden.length >= 70);
  assert.equal(new Set(ILLUSTRATIES.beelden.map((i) => i.id)).size, ILLUSTRATIES.beelden.length);
  assert.equal(new Set(ILLUSTRATIES.beelden.map((i) => i.categorie)).size, 7);
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

test("herstelronde 2: elke zoekterm krijgt France, de drempel is 7 en de pasvormopdracht keurt buitenlandse beelden af", async () => {
  const { PASVORM_DREMPEL, metFrance } = await import("../lib/motor/beeld-unsplash");
  assert.equal(PASVORM_DREMPEL, 7);
  assert.equal(metFrance("flooded street"), "flooded street France");
  assert.equal(metFrance("french village market"), "french village market");
  assert.equal(metFrance("street in france"), "street in france");
  const { f, log } = nepUnsplash({ zoek: [[mk("a1", "flooded street")]] });
  const system: string[] = [];
  const client: ModelClient = { tekst: async (a) => (system.push(a.system), '{"keuze":1,"cijfer":7}') };
  const r = await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client }, maakUnsplashGenerator(f, () => "test"));
  assert.ok(r, "cijfer 7 haalt de drempel");
  assert.ok(log.some((u) => u.includes("query=flooded+street+France")), log.join(" "));
  assert.match(system[0], /in een ander land speelt dan Frankrijk/);
  assert.match(system[0], /belastingformulieren/);
  assert.match(system[0], /toeristische/);
  // 6 is onder de nieuwe drempel: terugval, geen zoekfoto
  const g = nepUnsplash({ zoek: [[mk("x1", "street")]] });
  const r6 = await beeldResultaat({ ...invoer, zoektermen: ["flooded street"], client: modelMet('{"keuze":1,"cijfer":6}') }, maakUnsplashGenerator(g.f, () => "test"));
  assert.ok(r6 && !r6.url.split("?")[0].endsWith("x1"));
});

test("de regel 'nooit dezelfde foto' geldt niet voor illustraties: hergebruik is toegestaan", async () => {
  const recent: string[] = [];
  const g = maakUnsplashGenerator(nepUnsplash().f, () => "");
  const uit = new Set<string>();
  for (let i = 0; i < ILLUSTRATIES.beelden.filter((x) => x.categorie === "algemeen").length + 3; i++) {
    const r = await beeldResultaat({ kop: `Nieuws ${i}`, samenvatting: "Iets.", categorie: "algemeen", vermijd: uit, recent }, g);
    assert.ok(r && r.credit?.bron === "Illustratie", "nooit zonder beeld");
  }
  assert.ok(recent.length > 0);
});
