// Zijbalk /inbed/zijbalk: alleen groene PEIL-chips, kanaalfilter, geen perslink, PEIL-blok weg bij storing, headers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { MEER_NIEUWS_URL, PORTEMONNEE_CHIP, ZIJBALK_BERICHTEN, ZIJBALK_LEEG, ZIJBALK_PEIL, chipsVan, laadZijbalkItems, peilRegels, zijbalkAantal, zijbalkKanaal, zijbalkPeilAantal } from "../lib/inbed-zijbalk";
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

test("kanaalfilter, weg en status; nieuwste eerst, standaard hooguit 10", async () => {
  const o = new GeheugenOpslag();
  for (let n = 0; n < 15; n++) o.berichtenLijst.push(bericht(n));
  o.berichtenLijst.push(bericht(20, { kanalen: { ...alle, zijbalk: false } }), bericht(21, { kanalen: { ...alle, infofrankrijk: false } }), bericht(22, { redactie: "weg" }), bericht(23, { status: "concept" }));
  const z = (await laadZijbalkItems(o, "zijbalk", naam))!;
  assert.equal(ZIJBALK_BERICHTEN, 10);
  assert.equal(z.length, 10);
  assert.equal((await laadZijbalkItems(o, "zijbalk", naam, 3))!.length, 3);
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
  const z = o.berichtenLijst.map((b) => ({ titel: b.kop, chips: chipsVan(b, zinnen) }));
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

test("PEIL-blok: standaard 4 regels met datum of In discussie, tool en Alles in PEIL; bij storing (leeg of null) geen blok maar wel de rest", async () => {
  assert.equal(ZIJBALK_PEIL, 4);
  const regels = peilRegels([1, 2, 3, 4, 5, 6].map(aank));
  assert.equal(regels.length, 4);
  assert.equal(peilRegels([1, 2, 3, 4].map(aank), 2).length, 2);
  const o = await opslagMet([bericht(1)]);
  const items = (await laadZijbalkItems(o, "zijbalk", naam))!;
  const html = renderToStaticMarkup(React.createElement(Zijbalk, { items, peil: regels, bijgewerkt: "Bijgewerkt vandaag 14.46 uur" }));
  assert.match(html, /Nieuws over Frankrijk/);
  assert.match(html, /Wat verandert er voor u/);
  assert.match(html, /In discussie/);
  assert.match(html, /Reken het uit met <a href="https:\/\/www\.infofrankrijk\.com\/kompas"/);
  assert.match(html, /Alles in PEIL/);
  assert.match(html, /Bijgewerkt vandaag 14\.46 uur/);
  for (const peil of [[], null]) {
    const h = renderToStaticMarkup(React.createElement(Zijbalk, { items, peil, bijgewerkt: null }));
    assert.ok(!/Wat verandert er voor u|Alles in PEIL/.test(h));
    assert.match(h, /Kop 1/);
    assert.match(h, /Lees meer nieuws/);
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
  assert.ok(html.indexOf("Lees meer nieuws") < html.indexOf("Wat verandert er voor u"), "Lees meer staat vóór het PEIL-blok");
  assert.ok(!html.includes("Zin 1."), "de lange zin staat er niet in");
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

test("?aantal= (1 tot 20, standaard 10) en ?peil= (0 tot 8, standaard 4): begrensd, onzin geeft de standaard", () => {
  assert.equal(zijbalkAantal(undefined), 10);
  assert.equal(zijbalkAantal("6"), 6);
  assert.equal(zijbalkAantal("0"), 1);
  assert.equal(zijbalkAantal("99"), 20);
  assert.equal(zijbalkAantal("abc"), 10);
  assert.equal(zijbalkAantal("-3"), 10);
  assert.equal(zijbalkPeilAantal(undefined), 4);
  assert.equal(zijbalkPeilAantal("0"), 0);
  assert.equal(zijbalkPeilAantal("8"), 8);
  assert.equal(zijbalkPeilAantal("50"), 8);
  assert.equal(zijbalkPeilAantal("x"), 4);
});

test("geen scrollbalk: html en body overflow hidden op de zijbalk; Hoogte meet de body, luistert op beelden en body; plakblok heeft scrolling=no en ruime starthoogte", () => {
  const css = readFileSync("app/inbed/inbed.css", "utf8");
  assert.match(css, /html:has\(\.zb\), body:has\(\.zb\) \{[^}]*overflow: hidden/);
  const src = readFileSync("app/inbed/Hoogte.tsx", "utf8");
  assert.ok(src.includes("ResizeObserver") && src.includes('addEventListener("load", stuur, true)') && src.includes("getBoundingClientRect"));
  const doc = readFileSync("docs/inbedden.md", "utf8");
  const blok = doc.match(/<iframe id="nlfr-nieuws" src="https:\/\/nieuws\.infofrankrijk\.com\/inbed\/zijbalk"[^>]*>/)![0];
  assert.match(blok, /scrolling="no"/);
  assert.match(blok, /height="3100"/);
});
