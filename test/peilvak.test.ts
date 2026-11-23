import test from "node:test";
import assert from "node:assert/strict";
import { kiesAankondigingen, netjes } from "../lib/peilvak";

test("PEIL-vak: alleen toekomstige of ongedateerde aankondigingen, oplopend, hooguit 4", () => {
  const p = (id: string, datum: string | null) => ({ id, naam: `P ${id}`, tools: [{ naam: "Tool", url: "https://t.example" }], aangekondigd: { datum, omschrijving: `Wijziging ${id} (raming)` } });
  const { lijst, totaal } = kiesAankondigingen([p("a", "2027-02-01"), p("b", "2026-01-01"), p("c", "2027-01-01"), p("d", null), p("e", "2027-03-01"), p("f", "2027-04-01"), { id: "g", naam: "zonder" }], "2026-11-23", 4);
  assert.equal(totaal, 6);
  assert.deepEqual(lijst.map((a) => a.id), ["c", "a", "e", "f"]);
  assert.equal(lijst[0].voorlopig, true);
  assert.doesNotMatch(lijst[0].omschrijving, /raming/);
  assert.equal(lijst[0].tools[0].naam, "Tool");
});

test("PEIL-vak: lange omschrijving wordt bij een zinsgrens ingekort", () => {
  const lang = "Eerste zin met genoeg woorden om de grens van tachtig tekens ruim te halen, echt waar. " + "x ".repeat(200);
  const { tekst } = netjes(lang, 240);
  assert.ok(tekst.length <= 241);
  assert.match(tekst, /echt waar\.$/);
});
