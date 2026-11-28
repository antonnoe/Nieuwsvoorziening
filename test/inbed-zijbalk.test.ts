// Zijbalk /inbed/zijbalk: alleen groene PEIL-chips, kanaalfilter, geen perslink, PEIL-blok weg bij storing, headers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { MEER_NIEUWS_URL, PORTEMONNEE_CHIP, ZIJBALK_BERICHTEN, ZIJBALK_LEEG, laadZijbalkItems, peilRegels, zijbalkKanaal } from "../lib/inbed-zijbalk";
import type { Aankondiging } from "../lib/peilvak";
import Zijbalk from "../app/inbed/zijbalk/Zijbalk";
import nextConfig from "../next.config.mjs";

const alle = { actueel: true, nieuwsbrief: true, infopoche: true, zijbalk: true, infofrankrijk: true };
const bericht = (n: number, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id: `id-${n}`, soort: "pers", kop: `Kop ${n}`, samenvatting: `S ${n}`, tekst: "t", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [],
  portemonnee: false, signaal: null, signaalBeoordeeld: true, beeldUrl: null, beeldCredit: null, peil: { raakt: [], mogelijkGewijzigd: [] },
  bronnen: [{ naam: "Le Monde", url: "https://www.lemonde.fr/artikel", kop: "x", datum: "2026-11-20" }],
  gepubliceerdOp: new Date(Date.UTC(2026, 10, 20, 10, n)).toISOString(), regelversie: 2, ...o,
} as unknown as OpgeslagenBericht);
const koppeling = (zekerheid?: string) => ({ id: "p.aow", naam: "AOW-leeftijd (jargon)", tools: [], ...(zekerheid ? { zekerheid } : {}) }) as never;
const naam = (c: string) => c;
const opslagMet = async (lijst: OpgeslagenBericht[]) => {
  const o = new GeheugenOpslag();
  o.berichtenLijst.push(...lijst);
  return o;
};

test("kanaal: standaard zijbalk, ?kanaal=infofrankrijk geeft infofrankrijk, onbekend valt terug op zijbalk", () => {
  assert.equal(zijbalkKanaal(undefined), "zijbalk");
  assert.equal(zijbalkKanaal("infofrankrijk"), "infofrankrijk");
  assert.equal(zijbalkKanaal("nieuwsbrief"), "zijbalk");
});

test("kanaalfilter, weg en status; nieuwste eerst, hooguit 6", async () => {
  const o = new GeheugenOpslag();
  for (let n = 0; n < 9; n++) o.berichtenLijst.push(bericht(n));
  o.berichtenLijst.push(bericht(20, { kanalen: { ...alle, zijbalk: false } }), bericht(21, { kanalen: { ...alle, infofrankrijk: false } }), bericht(22, { redactie: "weg" }), bericht(23, { status: "concept" }));
  const z = (await laadZijbalkItems(o, "zijbalk", naam))!;
  assert.equal(z.length, ZIJBALK_BERICHTEN);
  assert.ok(!z.some((i) => ["Kop 20", "Kop 22", "Kop 23"].includes(i.titel)));
  assert.ok(z.some((i) => i.titel === "Kop 21"), "kanaal infofrankrijk uit raakt de zijbalk niet");
  const f = (await laadZijbalkItems(o, "infofrankrijk", naam))!;
  assert.ok(f.some((i) => i.titel === "Kop 20") && !f.some((i) => i.titel === "Kop 21"));
  assert.deepEqual((await laadZijbalkItems(new GeheugenOpslag(), "zijbalk", naam)), []);
});

test("PEIL-chip alleen bij een groene koppeling met lezerstitel; oranje of zonder zekerheid niets; portemonnee-chip daarnaast", async () => {
  const o = new GeheugenOpslag();
  const zinnen = new Map([["p.aow", { hash: "h", zin: "z", titel: "Uw AOW-leeftijd" }]]);
  o.lezerszinnen = async () => zinnen;
  o.berichtenLijst.push(
    bericht(1, { peil: { raakt: [koppeling("groen")], mogelijkGewijzigd: [] } }),
    bericht(2, { peil: { raakt: [koppeling("oranje")], mogelijkGewijzigd: [] } }),
    bericht(3, { peil: { raakt: [koppeling()], mogelijkGewijzigd: [] } }),
    bericht(4, { portemonnee: true }),
    bericht(5, { portemonnee: true, peil: { raakt: [koppeling("groen")], mogelijkGewijzigd: [] } }),
    bericht(6, { peil: { raakt: [{ id: "p.zonder.titel", naam: "Jargonnaam", zekerheid: "groen" as const }], mogelijkGewijzigd: [] } }),
  );
  const z = (await laadZijbalkItems(o, "zijbalk", naam))!;
  const chips = (t: string) => z.find((i) => i.titel === t)!.chips.map((c) => c.tekst);
  assert.deepEqual(chips("Kop 1"), ["PEIL: Uw AOW-leeftijd"]);
  assert.deepEqual(chips("Kop 2"), []);
  assert.deepEqual(chips("Kop 3"), []);
  assert.deepEqual(chips("Kop 4"), [PORTEMONNEE_CHIP]);
  assert.deepEqual(chips("Kop 5"), ["PEIL: Uw AOW-leeftijd"]);
  assert.deepEqual(chips("Kop 6"), [], "nooit de PEIL-naam tonen");
  assert.equal(z.find((i) => i.titel === "Kop 1")!.chips[0].url, "https://communitiesabroad.com/peil");
});

const aank = (n: number): Aankondiging => ({ id: `a${n}`, naam: `Titel ${n}`, peilNaam: "x", datum: n === 2 ? null : `2027-0${n}-01`, omschrijving: `Zin ${n}.`, voorlopig: false, tools: n === 1 ? [{ naam: "Financieel Kompas", url: "https://www.infofrankrijk.com/kompas" }] : [], nieuws: [], inDiscussie: n === 2 });

test("PEIL-blok: 3 regels met datum of In discussie, tool en Alles in PEIL; bij storing (leeg of null) geen blok maar wel de rest", async () => {
  const regels = peilRegels([1, 2, 3, 4].map(aank));
  assert.equal(regels.length, 3);
  const o = await opslagMet([bericht(1)]);
  const items = (await laadZijbalkItems(o, "zijbalk", naam))!;
  const html = renderToStaticMarkup(React.createElement(Zijbalk, { items, peil: regels, bijgewerkt: "Bijgewerkt vandaag 14.46 uur" }));
  assert.match(html, /Nieuws over Frankrijk/);
  assert.match(html, /Wat verandert er voor u/);
  assert.match(html, /In discussie/);
  assert.match(html, /Reken het uit met: <a href="https:\/\/www\.infofrankrijk\.com\/kompas"/);
  assert.match(html, /Alles in PEIL/);
  assert.match(html, /Bijgewerkt vandaag 14\.46 uur/);
  for (const peil of [[], null]) {
    const h = renderToStaticMarkup(React.createElement(Zijbalk, { items, peil, bijgewerkt: null }));
    assert.ok(!/Wat verandert er voor u|Alles in PEIL/.test(h));
    assert.match(h, /Kop 1/);
    assert.match(h, /Meer nieuws over Frankrijk/);
  }
});

test("geen perslink in de HTML: alleen eigen sites en PEIL; lege staat en onderlink", async () => {
  const o = await opslagMet([bericht(1), bericht(2)]);
  const items = (await laadZijbalkItems(o, "zijbalk", naam))!;
  const html = renderToStaticMarkup(React.createElement(Zijbalk, { items, peil: peilRegels([aank(1)]), bijgewerkt: null }));
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1]).hostname);
  const toegestaan = ["nieuws.infofrankrijk.com", "communitiesabroad.com", "www.infofrankrijk.com"];
  assert.ok(hrefs.length > 3);
  for (const h of hrefs) assert.ok(toegestaan.includes(h), `onverwacht domein ${h}`);
  const bronnen = JSON.parse(readFileSync("data/bronnen.json", "utf8")).bronnen as { domein: string }[];
  for (const h of hrefs) for (const b of bronnen) assert.ok(!h.endsWith(b.domein) || ["infofrankrijk.com"].includes(b.domein), `bron ${b.domein}`);
  assert.ok(!/Le Monde|lemonde/i.test(html));
  assert.ok(html.includes(`href="${MEER_NIEUWS_URL}"`));
  const leeg = renderToStaticMarkup(React.createElement(Zijbalk, { items: [], peil: null, bijgewerkt: null }));
  assert.ok(leeg.includes(ZIJBALK_LEEG) && ZIJBALK_LEEG === "Er is nu geen nieuws.");
});

test("headers: frame-ancestors gelijk aan /inbed, geen X-Frame-Options, noindex; Hoogte stuurt beide berichten", async () => {
  const h = await nextConfig.headers!();
  const waarde = (src: string, key: string) => h.find((x: { source: string }) => x.source === src)!.headers.find((k: { key: string }) => k.key === key)?.value;
  assert.equal(waarde("/inbed/zijbalk", "Content-Security-Policy"), waarde("/inbed", "Content-Security-Policy"));
  assert.equal(waarde("/inbed/zijbalk", "X-Frame-Options"), undefined);
  assert.match(waarde("/inbed/zijbalk", "X-Robots-Tag")!, /noindex/);
  const src = readFileSync("app/inbed/Hoogte.tsx", "utf8");
  assert.ok(src.includes('type: "nv-hoogte"') && src.includes("nlfrNieuwsHeight"));
  assert.ok(readFileSync("app/inbed/zijbalk/page.tsx", "utf8").includes("<Hoogte ook />"));
});
