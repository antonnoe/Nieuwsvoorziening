import test from "node:test";
import assert from "node:assert/strict";
import { ILLUSTRATIES } from "../lib/motor/illustraties";
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
