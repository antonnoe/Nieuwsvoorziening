import test from "node:test";
import assert from "node:assert/strict";
import { leesFeed, oogstBronnen, schoneUrl } from "../lib/motor/feeds";
import { zeef, sportDoorlaat, faitsDiversDoorlaat, gaatOverFrankrijk } from "../lib/motor/zeef";
import { bron, rss } from "./helpers";

test("leesFeed leest RSS en haalt tracking uit de url", () => {
  const nu = Date.now();
  const x = rss([{ titel: "Grève à la SNCF", url: "https://a.test/x", datum: new Date(nu), omschrijving: "<p>Trains &amp; bus</p>" }]);
  const r = leesFeed(x, bron(), nu);
  assert.equal(r.length, 1);
  assert.equal(r[0].url, "https://a.test/x");
  assert.equal(r[0].samenvatting, "Trains & bus");
});

test("leesFeed leest Atom", () => {
  const x = `<feed><entry><title>Titre</title><link rel="alternate" href="https://a.test/y?utm_x=1&amp;id=2"/><updated>2026-11-23T08:00:00Z</updated><summary>S</summary></entry></feed>`;
  const r = leesFeed(x, bron());
  assert.equal(r[0].url, "https://a.test/y?id=2");
  assert.equal(r[0].gepubliceerdOp, "2026-11-23T08:00:00.000Z");
});

test("schoneUrl", () => assert.equal(schoneUrl("https://a.test/p?utm_source=x&xtor=1#f"), "https://a.test/p"));

test("zeef: geen sport, geen pure misdaad, buitenland alleen met Frankrijk", () => {
  assert.equal(sportDoorlaat("Ligue 1: le PSG gagne le match"), false);
  assert.equal(sportDoorlaat("Tour de France: circulation perturbée à Montpellier"), true);
  assert.equal(faitsDiversDoorlaat("Un homme poignardé à Toulouse"), false);
  assert.equal(faitsDiversDoorlaat("Incendie: vigilance orange dans le Var"), true);
  assert.equal(zeef({ titel: "Trump et Poutine se rencontrent" }, bron()).reden, "buitenland");
  assert.equal(zeef({ titel: "Trump menace la France de droits de douane" }, bron()).door, true);
  assert.equal(zeef({ titel: "Verkiezingen in Nederland" , samenvatting: "Rutte"}, bron({ frankrijkFilter: true })).reden, "geen_frankrijk");
  assert.equal(zeef({ titel: "Franse boeren blokkeren snelwegen" }, bron({ frankrijkFilter: true })).door, true);
  assert.equal(gaatOverFrankrijk("Macron kondigt aan"), true);
  assert.equal(gaatOverFrankrijk("Frans Timmermans spreekt"), true); // bekende beperking: "frans" telt mee
});

test("oogst: een mislukte bron breekt de rest niet, ontdubbelt op url, en past venster toe", async () => {
  const nu = Date.now();
  const goed = rss([
    { titel: "Impôts: nouvelle déclaration pour les résidents", url: "https://a.test/1", datum: new Date(nu - 3600_000) },
    { titel: "Impôts: nouvelle déclaration pour les résidents", url: "https://a.test/1", datum: new Date(nu - 3600_000) },
    { titel: "Oud nieuws over Frankrijk", url: "https://a.test/oud", datum: new Date(nu - 10 * 86400_000) },
  ]);
  const fetchFn = (async (u: string) => (String(u).includes("kapot") ? new Response("nee", { status: 500 }) : new Response(goed))) as unknown as typeof fetch;
  const r = await oogstBronnen([bron({ id: "ok" }), bron({ id: "kapot", feed: "https://kapot.test/f" })], { nu, fetchFn });
  assert.equal(r.items.length, 1);
  assert.equal(r.resultaten.find((x) => x.bronId === "kapot")?.ok, false);
  assert.equal(r.resultaten.find((x) => x.bronId === "ok")?.ok, true);
});
