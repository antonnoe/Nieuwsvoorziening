import test from "node:test";
import assert from "node:assert/strict";
import { ILLUSTRATIES, kiesIllustratie, illustratieResultaat, leesIllustraties, gaatOverNederland, type IllustratieLijst } from "../lib/motor/illustraties";
import { beeldResultaat, type BeeldGenerator } from "../lib/motor/beeld";
import { maakUnsplashGenerator } from "../lib/motor/beeld-unsplash";
import { CATEGORIEEN } from "../lib/motor/types";
import { publiekBericht } from "../lib/motor/api";
import type { OpgeslagenBericht } from "../lib/motor/opslag";
import type { ModelClient } from "../lib/motor/ai";

const beeld = (id: string, categorie: string, binding: "fr" | "nl", trefwoorden: string[]) => ({ id, categorie, naam: id, binding, trefwoorden, svg: `/illustraties/${id}.svg`, png: `/illustraties/${id}.png` });
const lijst: IllustratieLijst = {
  afkomst: "x",
  beelden: [
    beeld("v-tol-fr", "reizen en verkeer", "fr", ["tol", "péage", "snelweg"]),
    beeld("v-trein-fr", "reizen en verkeer", "fr", ["trein", "sncf"]),
    beeld("v-fiets-nl", "reizen en verkeer", "nl", ["fiets", "paspoort"]),
    beeld("v-bus-nl", "reizen en verkeer", "nl", ["bus"]),
    beeld("e-markt-fr", "economie en ondernemen", "fr", ["markt"]),
  ],
};
const b = (kop: string, samenvatting = "", categorie = "reizen en verkeer") => ({ kop, samenvatting, categorie });

test("keuze op categorie: alleen beelden van de categorie van het bericht", () => {
  assert.equal(kiesIllustratie(b("Iets over de markt", "", "economie en ondernemen"), [], lijst)?.id, "e-markt-fr");
  for (const i of [b("Tol omhoog"), b("Trein staakt")]) assert.equal(kiesIllustratie(i, [], lijst)?.categorie, "reizen en verkeer");
});

test("onbekende categorie: toch een beeld uit de hele set, nooit null", () => {
  assert.ok(kiesIllustratie(b("x", "y", "bestaat niet"), [], lijst));
});

test("nl-voorrang bij Nederland, Nederlander, Nederlandse en NL; anders fr-voorrang", () => {
  for (const kop of ["Nederlanders in Frankrijk krijgen een brief", "Nederlandse pensioenen", "Nieuws over Nederland", "Regels voor NL-inwoners"]) {
    assert.equal(kiesIllustratie(b(kop), [], lijst)?.binding, "nl", kop);
  }
  assert.equal(kiesIllustratie(b("De bus rijdt weer"), [], lijst)?.binding, "fr");
  assert.ok(!gaatOverNederland("Senegal en Anjou"));
});

test("trefwoordscore: accent- en hoofdletterongevoelig, de meeste treffers winnen", () => {
  assert.equal(kiesIllustratie(b("TOL en Péage op de snelweg", "De trein rijdt"), [], lijst)?.id, "v-tol-fr");
  assert.equal(kiesIllustratie(b("Staking bij SNCF", "De trein"), [], lijst)?.id, "v-trein-fr");
  assert.equal(kiesIllustratie(b("Nederlanders", "Paspoort en fiets"), [], lijst)?.id, "v-fiets-nl");
  assert.equal(kiesIllustratie(b("Nederlanders", "Een bus"), [], lijst)?.id, "v-bus-nl");
  const accent: IllustratieLijst = { afkomst: "x", beelden: [beeld("a-fr", "algemeen", "fr", ["pharmacie"]), beeld("b-fr", "algemeen", "fr", ["boulangerie"])] };
  assert.equal(kiesIllustratie(b("Pharmacíe sluit", "", "algemeen"), [], accent)?.id, "a-fr");
});

test("gelijke stand: het langst niet gebruikte beeld, nooit gebruikt telt als langst, daarna vaste volgorde", () => {
  const u = (id: string) => `https://nieuws.infofrankrijk.com/illustraties/${id}.svg`;
  assert.equal(kiesIllustratie(b("Neutraal"), [], lijst)?.id, "v-tol-fr", "vaste volgorde");
  assert.equal(kiesIllustratie(b("Neutraal"), [u("v-tol-fr")], lijst)?.id, "v-trein-fr", "nooit gebruikt gaat voor");
  assert.equal(kiesIllustratie(b("Neutraal"), [u("v-tol-fr"), u("v-trein-fr")], lijst)?.id, "v-trein-fr", "trein is langer geleden dan tol");
  const nl = ["x", "y"];
  assert.ok(nl.length);
  // trefwoorden gaan voor recentheid
  assert.equal(kiesIllustratie(b("Tol"), [u("v-trein-fr")], lijst)?.id, "v-tol-fr");
});

test("resultaat: absolute SVG-url, credit met bron, maker, categorie, naam en PNG; basis uit NIEUWS_BASIS_URL", () => {
  const r = illustratieResultaat(b("Tol"), [], lijst)!;
  assert.equal(r.url, "https://nieuws.infofrankrijk.com/illustraties/v-tol-fr.svg");
  assert.deepEqual(r.credit, { bron: "Illustratie", maker: "Communities Abroad", categorie: "reizen en verkeer", naam: "v-tol-fr", png: "https://nieuws.infofrankrijk.com/illustraties/v-tol-fr.png" });
  const oud = process.env.NIEUWS_BASIS_URL;
  process.env.NIEUWS_BASIS_URL = "https://test.example/";
  try {
    assert.equal(illustratieResultaat(b("Tol"), [], lijst)!.url, "https://test.example/illustraties/v-tol-fr.svg");
  } finally {
    if (oud === undefined) delete process.env.NIEUWS_BASIS_URL;
    else process.env.NIEUWS_BASIS_URL = oud;
  }
});

test("de echte set: elke categorie geeft altijd een beeld, bestanden bestaan", async () => {
  const { existsSync } = await import("node:fs");
  assert.ok(ILLUSTRATIES.beelden.length >= 70);
  for (const c of CATEGORIEEN) {
    for (const kop of ["Gewoon nieuws", "Nederlanders in Frankrijk", "Tol en trein"]) {
      const i = kiesIllustratie({ kop, samenvatting: "", categorie: c });
      assert.ok(i && i.categorie === c, `${c}: ${kop}`);
      assert.ok(existsSync(`public${i.svg}`) && existsSync(`public${i.png}`), i.id);
    }
  }
});

test("faalt de lijst, dan geen illustratie en geen fout", () => {
  assert.deepEqual(leesIllustraties(null).beelden, []);
  assert.deepEqual(leesIllustraties({ beelden: "kapot" }).beelden, []);
  assert.deepEqual(leesIllustraties({ beelden: [{ id: 1 }, null, 5] }).beelden, []);
  assert.equal(kiesIllustratie(b("x"), [], { afkomst: "x", beelden: [] }), null);
});

const gen = (r: unknown): BeeldGenerator => ({ naam: "t", genereer: async () => r as never });

test("Unsplash met goede pasvorm gaat voor; zonder resultaat, fout of generator een illustratie", async () => {
  const inv = { kop: "Tol", samenvatting: "x", categorie: "reizen en verkeer" as const };
  const foto = await beeldResultaat(inv, gen({ url: "https://images.unsplash.com/a1", credit: { bron: "Unsplash", maker: "M" } }));
  assert.equal(foto?.url, "https://images.unsplash.com/a1");
  for (const g of [gen(null), { naam: "k", genereer: async () => { throw new Error("stuk"); } }, null]) {
    const r = await beeldResultaat(inv, g);
    assert.equal(r?.credit?.bron, "Illustratie");
    assert.match(r!.url, /^https:\/\/nieuws\.infofrankrijk\.com\/illustraties\/.+\.svg$/);
  }
});

test("Unsplash 403, 429 en zonder model: illustratie; recent wordt bijgewerkt", async () => {
  const mkFetch = (status: number) => (async () => new Response("", { status })) as unknown as typeof fetch;
  const inv = { kop: "Tol", samenvatting: "x", categorie: "reizen en verkeer" as const, zoektermen: ["toll road", "highway toll"] };
  for (const status of [403, 429]) {
    const recent: string[] = [];
    const r = await beeldResultaat({ ...inv, recent, client: { tekst: async () => '{"keuze":1,"cijfer":9}' } as ModelClient }, maakUnsplashGenerator(mkFetch(status), () => "k"));
    assert.equal(r?.credit?.bron, "Illustratie", String(status));
    assert.equal(recent[0], r!.url);
  }
  const r = await beeldResultaat({ ...inv, client: null }, maakUnsplashGenerator((async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as unknown as typeof fetch, () => "k"));
  assert.equal(r?.credit?.bron, "Illustratie");
});

test("minst recent gebruikt werkt door over meerdere berichten in een run", async () => {
  const recent: string[] = [];
  const ids = new Set<string>();
  const n = ILLUSTRATIES.beelden.filter((i) => i.categorie === "algemeen" && i.binding === "fr").length;
  for (let k = 0; k < n; k++) ids.add((await beeldResultaat({ kop: "Neutraal nieuws", samenvatting: "", categorie: "algemeen", recent }, null))!.url);
  assert.equal(ids.size, n, "elk beeld één keer voor er hergebruik komt");
  const extra = (await beeldResultaat({ kop: "Neutraal nieuws", samenvatting: "", categorie: "algemeen", recent }, null))!.url;
  assert.ok(ids.has(extra), "daarna hergebruik");
});

test("publieke API: beeldPng achteraan voor illustraties, null voor foto's", () => {
  const basis: OpgeslagenBericht = { id: "i", kop: "K", samenvatting: "S", tekst: "T", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [], beeldUrl: null, gepubliceerdOp: "2026-11-28T08:00:00.000Z", peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [] };
  const r = illustratieResultaat(b("Tol"), [], lijst)!;
  const p = publiekBericht({ ...basis, beeldUrl: r.url, beeldCredit: r.credit }, false) as Record<string, unknown>;
  assert.equal(p.beeldPng, "https://nieuws.infofrankrijk.com/illustraties/v-tol-fr.png");
  assert.equal(p.beeldUrl, r.url);
  assert.deepEqual(p.beeldCredit, r.credit);
  assert.equal(Object.keys(p).at(-1), "beeldPng");
  const f = publiekBericht({ ...basis, beeldUrl: "https://images.unsplash.com/a", beeldCredit: { bron: "Unsplash", maker: "M", makerUrl: "u", bronUrl: "b" } }, false) as Record<string, unknown>;
  assert.equal(f.beeldPng, null);
  assert.equal((publiekBericht(basis, false) as Record<string, unknown>).beeldPng, null);
});
