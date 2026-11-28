// Inbedvenster /inbed: tabverdeling, weggehaald en kanaal uit, de nlfr-tab (alleen tegels infofrankrijk en verenigingen), fouttekst en headers.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { AANTAL, LEEG, NLFR_FOUT, NLFR_URL, bijgewerktTekst, laadBerichtItems, laadBijgewerkt, laadNlfr, leesTab, wisNlfrCache } from "../lib/inbed";
import nextConfig from "../next.config.mjs";

const bericht = (n: number, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id: `id-${n}`, soort: "pers", kop: `Kop ${n}`, samenvatting: `Samenvatting ${n}`, tekst: "t", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [],
  portemonnee: false, signaal: null, signaalBeoordeeld: true, beeldUrl: null, beeldCredit: null, peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [],
  gepubliceerdOp: new Date(Date.UTC(2026, 10, 20, 10, n)).toISOString(), regelversie: 2, ...o,
} as OpgeslagenBericht);
const alle = { actueel: true, nieuwsbrief: true, infopoche: true, zijbalk: true, infofrankrijk: true };
const naam = (c: string) => c;
beforeEach(() => wisNlfrCache());

test("tabverdeling: pers onder Nieuws, overheid onder Overheid, nieuwste eerst, hooguit 15", async () => {
  const o = new GeheugenOpslag();
  for (let n = 0; n < 20; n++) o.berichtenLijst.push(bericht(n));
  o.berichtenLijst.push(bericht(50, { soort: "overheid", regime: "overheid" }), bericht(51, { soort: "overheid", regime: "overheid" }));
  const pers = (await laadBerichtItems(o, "pers", naam))!;
  assert.equal(pers.length, AANTAL);
  assert.equal(pers[0].titel, "Kop 19");
  assert.ok(pers.every((i) => i.url.startsWith("https://nieuws.infofrankrijk.com/bericht/id-")));
  const ov = (await laadBerichtItems(o, "overheid", naam))!;
  assert.deepEqual(ov.map((i) => i.titel), ["Kop 51", "Kop 50"]);
});

test("weggehaald, kanaal actueel uit, concept en geblokkeerd worden niet getoond", async () => {
  const o = new GeheugenOpslag();
  o.berichtenLijst.push(bericht(1), bericht(2, { redactie: "weg" }), bericht(3, { kanalen: { ...alle, actueel: false } }), bericht(4, { status: "concept" }), bericht(5, { status: "geblokkeerd" }));
  const r = (await laadBerichtItems(o, "pers", naam))!;
  assert.deepEqual(r.map((i) => i.titel), ["Kop 1"]);
  assert.deepEqual(await laadBerichtItems(new GeheugenOpslag(), "pers", naam), []); // leeg is leeg, geen fout
  assert.equal(LEEG, "Er is nu geen nieuws in dit onderdeel.");
});

const tegels = {
  bijgewerkt: "x",
  tegels: [
    { soort: "overheid", artikelen: [{ url: "https://a.test/1", titel: "Overheid hoort hier niet", summary: "s", bronMeta: { naam: "Bercy", datum: "2026-11-28T10:00:00Z" } }] },
    { soort: "infofrankrijk", artikelen: [{ url: "https://www.infofrankrijk.com/a", titel: "Update IF", summary: "Samenvatting IF", bronMeta: { naam: "Infofrankrijk", datum: "2026-11-26T10:00:00Z" }, geheim: "x" }] },
    { soort: "verenigingen", artikelen: [{ url: "https://vereniging.test/b", titel: "Vereniging nieuws", summary: "S", bronMeta: { naam: "NVLR", datum: "2026-11-27T10:00:00Z" } }, { url: "javascript:alert(1)", titel: "fout" }] },
    { soort: "archief", artikelen: [{ url: "https://arch.test/c", titel: "Archief", summary: "s" }] },
  ],
};
test("NL'ers in FR: alleen tegels infofrankrijk en verenigingen, nieuwste eerst, cache van 15 minuten, alleen-lezen GET", async () => {
  let n = 0; let init: RequestInit | undefined; let adres = "";
  const f = (async (u: string, i?: RequestInit) => { n++; adres = u; init = i; return new Response(JSON.stringify(tegels), { status: 200 }); }) as unknown as typeof fetch;
  const nu = Date.now();
  const r = (await laadNlfr(f, nu))!;
  assert.deepEqual(r.map((i) => i.titel), ["Vereniging nieuws", "Update IF"]);
  assert.deepEqual(r[0], { sleutel: "https://vereniging.test/b", titel: "Vereniging nieuws", url: "https://vereniging.test/b", samenvatting: "S", label: "NVLR", datum: "2026-11-27T10:00:00Z" });
  assert.equal(adres, NLFR_URL);
  assert.ok(!init?.method || init.method === "GET");
  assert.ok(init?.signal, "met time-out");
  await laadNlfr(f, nu + 14 * 60_000);
  assert.equal(n, 1, "binnen 15 minuten uit de cache");
  await laadNlfr(f, nu + 16 * 60_000);
  assert.equal(n, 2);
});

test("NL'ers in FR: een fout of time-out geeft null (de pagina toont dan de nette tekst)", async () => {
  assert.equal(await laadNlfr((async () => { throw new Error("time-out"); }) as unknown as typeof fetch), null);
  wisNlfrCache();
  assert.equal(await laadNlfr((async () => new Response("nee", { status: 500 })) as unknown as typeof fetch), null);
  wisNlfrCache();
  assert.equal(await laadNlfr((async () => new Response("{}", { status: 200 })) as unknown as typeof fetch), null);
  assert.equal(NLFR_FOUT, "Even niet beschikbaar.");
  const pagina = readFileSync(new URL("../app/inbed/page.tsx", import.meta.url), "utf8");
  assert.match(pagina, /NLFR_FOUT/);
});

test("Bijgewerkt: echte tijd van de laatste geslaagde run, Europe/Amsterdam; een lopende run telt niet", async () => {
  const nu = Date.parse("2026-11-28T15:00:00Z");
  assert.equal(bijgewerktTekst("2026-11-28T13:07:00Z", nu), "Bijgewerkt vandaag 14.07 uur");
  assert.equal(bijgewerktTekst("2026-11-27T13:07:00Z", nu), "Bijgewerkt 27 november 14.07 uur");
  assert.equal(bijgewerktTekst(undefined, nu), null);
  const o = new GeheugenOpslag();
  assert.equal(await laadBijgewerkt(o), undefined);
  o.runs.push({ gestartOp: "2026-11-28T13:00:00Z", klaarOp: "2026-11-28T13:07:00Z", droog: false, stappen: [], aantallen: {}, fouten: [] } as never);
  assert.equal(await laadBijgewerkt(o), "2026-11-28T13:07:00Z");
  o.runs.push({ gestartOp: "2026-11-28T14:00:00Z", droog: false, stappen: [], aantallen: {}, fouten: [] } as never);
  assert.equal(await laadBijgewerkt(o), undefined, "een run zonder klaarOp is geen geslaagde run");
});

test("tabparameter: onbekend is nieuws", () => {
  assert.equal(leesTab("overheid"), "overheid");
  assert.equal(leesTab("nlfr"), "nlfr");
  assert.equal(leesTab("x"), "nieuws");
  assert.equal(leesTab(undefined), "nieuws");
});

test("headers: frame-ancestors alleen de eigen sites, geen X-Frame-Options, noindex", async () => {
  const h = await nextConfig.headers!();
  const inbed = h.filter((x: { source: string }) => x.source === "/inbed");
  assert.equal(inbed.length, 1);
  const kop = Object.fromEntries(inbed[0].headers.map((x: { key: string; value: string }) => [x.key.toLowerCase(), x.value]));
  assert.equal(kop["content-security-policy"], "frame-ancestors 'self' https://www.nederlanders.fr https://nederlanders.fr https://*.ning.com https://infofrankrijk.com https://*.infofrankrijk.com https://infopoche.fr");
  assert.match(kop["x-robots-tag"], /noindex/);
  assert.ok(!("x-frame-options" in kop));
  assert.ok(!h.some((x: { headers: { key: string }[] }) => x.headers.some((y) => y.key.toLowerCase() === "x-frame-options")), "nergens X-Frame-Options");
});

test("de pagina stuurt nv-hoogte naar de ouder en heeft geen kop of voet van de site", () => {
  const hoogte = readFileSync(new URL("../app/inbed/Hoogte.tsx", import.meta.url), "utf8");
  assert.match(hoogte, /type: "nv-hoogte"/);
  assert.match(hoogte, /window\.parent\.postMessage/);
  const css = readFileSync(new URL("../app/inbed/inbed.css", import.meta.url), "utf8");
  assert.match(css, /body:has\(\.ib\) \.net, body:has\(\.ib\) footer/);
  const pagina = readFileSync(new URL("../app/inbed/page.tsx", import.meta.url), "utf8");
  assert.match(pagina, /target="_blank" rel="noopener"/);
  assert.match(pagina, /nocache: true/);
});
