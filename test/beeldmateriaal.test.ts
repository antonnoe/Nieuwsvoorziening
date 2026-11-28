import test from "node:test";
import assert from "node:assert/strict";
import { ILLUSTRATIES, leesIllustraties } from "../lib/motor/illustraties";
import { beeldmateriaalSecties, groepeerBeelden } from "../lib/beeldmateriaal";
import { CATEGORIEEN } from "../lib/motor/types";

test("beeldmateriaal: alle beelden uit de index staan in een sectie, zonder verlies", () => {
  const secties = beeldmateriaalSecties();
  const totaal = secties.reduce((n, s) => n + s.beelden.length, 0);
  assert.equal(totaal, ILLUSTRATIES.beelden.length);
  assert.ok(totaal > 0);
  const ids = secties.flatMap((s) => s.beelden.map((b) => b.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const s of secties) for (const b of s.beelden) assert.equal(b.categorie, s.categorie);
});

test("beeldmateriaal: vaste volgorde, kop met hoofdletter, onbekende categorie gaat niet verloren", () => {
  const b = (id: string, categorie: string) => ({ id, categorie, naam: id, binding: "fr" as const, trefwoorden: [], svg: `/${id}.svg`, png: `/${id}.png` });
  const s = groepeerBeelden([b("a", "merkwaardig"), b("b", "algemeen"), b("c", "nieuw"), b("d", "algemeen")]);
  assert.deepEqual(s.map((x) => x.categorie), ["algemeen", "merkwaardig", "nieuw"]);
  assert.equal(s[0].kop, "Algemeen");
  assert.equal(s[0].beelden.length, 2);
  const volgorde = beeldmateriaalSecties().map((x) => x.categorie).filter((c) => (CATEGORIEEN as readonly string[]).includes(c));
  assert.deepEqual(volgorde, CATEGORIEEN.filter((c) => volgorde.includes(c)));
});

test("beeldmateriaal: elk beeld heeft een groep en beschrijving; elke groep heeft minstens 2 beelden", () => {
  const per = new Map<string, number>();
  for (const b of ILLUSTRATIES.beelden) {
    assert.ok(b.groep && b.groep.trim(), `groep ontbreekt bij ${b.id}`);
    assert.ok(b.beschrijving && b.beschrijving.trim(), `beschrijving ontbreekt bij ${b.id}`);
    per.set(b.groep!, (per.get(b.groep!) ?? 0) + 1);
  }
  for (const [g, n] of per) assert.ok(n >= 2, `groep ${g} heeft ${n} beeld`);
});

test("beeldmateriaal: groepen binnen een sectie verliezen niets en leesIllustraties kent ontbrekende velden", () => {
  for (const s of beeldmateriaalSecties()) {
    assert.equal(s.groepen.reduce((n, g) => n + g.beelden.length, 0), s.beelden.length);
  }
  const l = leesIllustraties({ beelden: [{ id: "x", categorie: "algemeen", naam: "X", svg: "/x.svg", png: "/x.png" }] });
  assert.equal(l.beelden.length, 1);
  assert.equal(l.beelden[0].groep, undefined);
});

// ---- Detailpagina /beeldmateriaal/[id] ----
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RECHTEN_TEKST, beeldDetail, beeldIds } from "../lib/beeldmateriaal";
import BeeldDetail, { generateStaticParams } from "../app/beeldmateriaal/[id]/page";
import Sitemap from "../app/sitemap";

test("detailpagina: elk index-id heeft een pagina met terugknop naar het anker, groot beeld, tekst, rechten en twee downloads", async () => {
  assert.deepEqual(generateStaticParams().map((p) => p.id), ILLUSTRATIES.beelden.map((b) => b.id));
  assert.equal(beeldIds().length, ILLUSTRATIES.beelden.length);
  for (const b of ILLUSTRATIES.beelden) {
    const h = renderToStaticMarkup(await BeeldDetail({ params: Promise.resolve({ id: b.id }) }));
    assert.ok(h.includes(`href="/beeldmateriaal#${b.id}"`) && h.includes("Terug naar beeldmateriaal"), b.id);
    assert.ok(h.includes(`src="${b.svg}"`), b.id);
    assert.ok(h.includes(`href="${b.svg}" download`) && h.includes("Download SVG") && h.includes(`href="${b.png}" download`) && h.includes("Download PNG"), b.id);
    assert.ok(h.includes("schriftelijke toestemming"), b.id);
    if (b.binding === "nl") assert.ok(h.includes("NL/BE"), b.id);
  }
  assert.ok(RECHTEN_TEKST.includes("schriftelijke toestemming"));
});

test("detailpagina: een onbekend id geeft 404 (notFound)", async () => {
  assert.equal(beeldDetail("bestaat-niet"), null);
  await assert.rejects(() => BeeldDetail({ params: Promise.resolve({ id: "bestaat-niet" }) }), (e: unknown) => /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String((e as { digest?: string }).digest ?? e)));
});

test("raster: elk beeld heeft het id als anker en linkt in hetzelfde tabblad naar de detailpagina; detailpagina's staan in de sitemap", async () => {
  const { default: Pagina } = await import("../app/beeldmateriaal/page");
  const h = renderToStaticMarkup(createElement(Pagina));
  for (const b of ILLUSTRATIES.beelden) {
    assert.ok(h.includes(`id="${b.id}"`), b.id);
    assert.ok(h.includes(`href="/beeldmateriaal/${b.id}"`), b.id);
  }
  assert.ok(!/class="beeldlink"[^>]*target=/.test(h), "geen target=_blank op de rasterlink");
  const urls = (await Sitemap()).map((x) => x.url);
  for (const b of ILLUSTRATIES.beelden) assert.ok(urls.some((u) => u.endsWith(`/beeldmateriaal/${b.id}`)), b.id);
});
