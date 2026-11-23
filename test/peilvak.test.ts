import test from "node:test";
import assert from "node:assert/strict";
import { kiesAankondigingen, netjes } from "../lib/peilvak";

test("PEIL-vak: alleen toekomstige of ongedateerde aankondigingen, oplopend, hooguit 4", () => {
  const p = (id: string, datum: string | null) => ({ id, naam: `P ${id}`, tools: [{ naam: `Tool ${id}`, url: "https://t.example" }], aangekondigd: { datum, omschrijving: `Wijziging ${id} (raming)` } });
  const { lijst, totaal } = kiesAankondigingen([p("a", "2027-02-01"), p("b", "2026-01-01"), p("c", "2027-01-01"), p("d", null), p("e", "2027-03-01"), p("f", "2027-04-01"), { id: "g", naam: "zonder" }], "2026-11-23", 4);
  assert.equal(totaal, 6);
  assert.deepEqual(lijst.map((a) => a.id), ["c", "a", "e", "f"]);
  assert.equal(lijst[0].voorlopig, true);
  assert.doesNotMatch(lijst[0].omschrijving, /raming/);
  assert.equal(lijst[0].tools[0].naam, "Tool c");
});

test("PEIL-vak: lange omschrijving wordt bij een zinsgrens ingekort", () => {
  const lang = "Eerste zin met genoeg woorden om de grens van tachtig tekens ruim te halen, echt waar. " + "Xx ".repeat(200);
  const { tekst } = netjes(lang, 240);
  assert.ok(tekst.length <= 241);
  assert.match(tekst, /echt waar\.$/);
});

test("PEIL-vak: hooguit één aankondiging per tool en geen knip na een afkorting", () => {
  const p = (id: string, tool: string) => ({ id, naam: id, tools: [{ naam: tool }], aangekondigd: { datum: "2027-01-01", omschrijving: "x" } });
  const { lijst } = kiesAankondigingen([p("a", "Erf"), p("b", "Erf"), p("c", "Energie")], "2026-11-23", 4);
  assert.deepEqual(lijst.map((a) => a.id), ["a", "c"]);
  const { tekst } = netjes("PLF 2027 art. 4 IV: plafond 50.000 euro voor geldschenkingen van 1 januari tot en met 30 juni 2027; daarnaast art. 4 I een vlak tarief van 6 % bij een gift aan een kind of kleinkind, mits het geld binnen zes maanden wordt besteed aan een woning", 240);
  assert.doesNotMatch(tekst, /art\.$/);
  assert.doesNotMatch(tekst, /art\. Nog/);
});

import { zinIsVeilig, hashOmschrijving } from "../lib/motor/lezerszin";

test("leesbare zin: alleen getallen uit de PEIL-omschrijving", () => {
  const om = "PLF 2027 art. 2 verhoogt de bovengrens van de tweede schijf van 29.579 naar 30.200 euro (inkomsten 2026)";
  assert.ok(zinIsVeilig("De begroting voor 2027 verhoogt de grens van de tweede schijf van 29.579 naar 30.200 euro.", om));
  assert.ok(!zinIsVeilig("De grens gaat naar 31.000 euro.", om));
  assert.ok(!zinIsVeilig("", om));
});

test("PEIL-vak gebruikt de leesbare zin alleen als die bij de huidige omschrijving hoort", () => {
  const p = { id: "x", naam: "X", aangekondigd: { datum: "2027-01-01", omschrijving: "PLF 2027 art. 2 technisch (raming)" } };
  const goed = new Map([["x", { hash: hashOmschrijving(p.aangekondigd.omschrijving), zin: "De begroting voor 2027 verandert dit" }]]);
  assert.equal(kiesAankondigingen([p], "2026-11-23", 4, goed).lijst[0].omschrijving, "De begroting voor 2027 verandert dit.");
  assert.equal(kiesAankondigingen([p], "2026-11-23", 4, goed).lijst[0].voorlopig, true);
  const oud = new Map([["x", { hash: "anders", zin: "Oude zin" }]]);
  assert.match(kiesAankondigingen([p], "2026-11-23", 4, oud).lijst[0].omschrijving, /PLF 2027/);
});

test("PEIL-vak: eerst wijzigingen met nieuws, dan hooguit twee in discussie (zoals de 10%-aftrek), dan op datum", () => {
  const p = (id: string, datum: string | null, om: string) => ({ id, naam: id, tools: [{ naam: `T${id}` }], aangekondigd: { datum, omschrijving: om } });
  const params = [
    p("datum1", "2027-01-01", "Gewone wijziging."),
    p("pensioen10", null, "Politieke discussie, nog geen besluit over de aftrek van 10 procent."),
    p("nieuws", "2027-06-01", "Wijziging met nieuws."),
    p("d2", null, "Wetsvoorstel ingediend."),
  ];
  const nieuws = new Map([["nieuws", [{ id: "b1", kop: "Kop" }]]]);
  const { lijst } = kiesAankondigingen(params, "2026-11-23", 4, new Map(), nieuws);
  assert.equal(lijst[0].id, "nieuws");
  assert.equal(lijst[0].nieuws[0].id, "b1");
  assert.ok(lijst.some((a) => a.id === "pensioen10"));
  assert.equal(lijst.filter((a) => a.inDiscussie).length, 2);
  assert.equal(lijst[3].id, "datum1");
});
