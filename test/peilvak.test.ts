import test from "node:test";
import assert from "node:assert/strict";
import { kiesAankondigingen, netjes } from "../lib/peilvak";
import { hashOmschrijving, GEEN_ZIN } from "../lib/motor/lezerszin";

/** Zinnen voor alle parameters (de ruwe PEIL-tekst wordt nooit getoond, alleen een geldige leesbare zin). */
const zinnenVoor = (ps: { id: string; aangekondigd?: { omschrijving?: string } | null }[]) =>
  new Map(ps.filter((p) => p.aangekondigd?.omschrijving).map((p) => [p.id, { hash: hashOmschrijving(p.aangekondigd!.omschrijving!), zin: `Leesbare zin over ${p.id}` }]));

test("PEIL-vak: alleen toekomstige of ongedateerde aankondigingen, oplopend, hooguit 4", () => {
  const p = (id: string, datum: string | null) => ({ id, naam: `P ${id}`, tools: [{ naam: `Tool ${id}`, url: "https://t.example" }], aangekondigd: { datum, omschrijving: `Wijziging ${id} (raming)` } });
  const { lijst, totaal } = (() => { const ps = [p("a", "2027-02-01"), p("b", "2026-01-01"), p("c", "2027-01-01"), p("d", null), p("e", "2027-03-01"), p("f", "2027-04-01"), { id: "g", naam: "zonder" }]; return kiesAankondigingen(ps, "2026-11-23", 4, zinnenVoor(ps as never)); })();
  assert.equal(totaal, 6);
  assert.deepEqual(lijst.map((a) => a.id), ["c", "a", "e", "f"]);
  assert.equal(lijst[0].voorlopig, true);
  assert.doesNotMatch(lijst[0].omschrijving, /raming/);
  assert.match(lijst[0].omschrijving, /^Leesbare zin over c/);
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
  const ps = [p("a", "Erf"), p("b", "Erf"), p("c", "Energie")];
  const { lijst } = kiesAankondigingen(ps as never, "2026-11-23", 4, zinnenVoor(ps as never));
  assert.deepEqual(lijst.map((a) => a.id), ["a", "c"]);
  const { tekst } = netjes("PLF 2027 art. 4 IV: plafond 50.000 euro voor geldschenkingen van 1 januari tot en met 30 juni 2027; daarnaast art. 4 I een vlak tarief van 6 % bij een gift aan een kind of kleinkind, mits het geld binnen zes maanden wordt besteed aan een woning", 240);
  assert.doesNotMatch(tekst, /art\.$/);
  assert.doesNotMatch(tekst, /art\. Nog/);
});

import { zinIsVeilig, zinAfkeurReden } from "../lib/motor/lezerszin";

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
  assert.equal(kiesAankondigingen([p], "2026-11-23", 4, oud).lijst.length, 0, "nooit de ruwe PEIL-tekst");
  assert.equal(kiesAankondigingen([p], "2026-11-23", 4).lijst.length, 0, "zonder zin geen regel");
  const geen = new Map([["x", { hash: hashOmschrijving(p.aangekondigd.omschrijving), zin: GEEN_ZIN }]]);
  assert.equal(kiesAankondigingen([p], "2026-11-23", 4, geen).lijst.length, 0, "GEEN wordt nooit getoond");
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
  const { lijst } = kiesAankondigingen(params, "2026-11-23", 4, zinnenVoor(params), nieuws);
  assert.equal(lijst[0].id, "nieuws");
  assert.equal(lijst[0].nieuws[0].id, "b1");
  assert.ok(lijst.some((a) => a.id === "pensioen10"));
  assert.equal(lijst.filter((a) => a.inDiscussie).length, 2);
  assert.equal(lijst[3].id, "datum1");
});

test("leesbare zin: de datum van de aankondiging en de parameternaam mogen getallen leveren", () => {
  const om = "PLF 2027 art. 4 verhoogt het plafond van 50.000 naar 60.000 euro";
  const zin = "Vanaf 1 januari 2027 stijgt het plafond van 50.000 naar 60.000 euro.";
  assert.ok(!zinIsVeilig(zin, om), "zonder datum is '1' onbekend");
  assert.ok(zinIsVeilig(zin, om, ["2027-01-01"]));
  assert.ok(zinIsVeilig("Voor schijf 2 stijgt het plafond van 50.000 naar 60.000 euro.", om, ["Tarief schijf 2"]));
  assert.ok(!zinIsVeilig("Vanaf 1 januari 2027 stijgt het plafond naar 61.000 euro.", om, ["2027-01-01"]));
  assert.equal(zinAfkeurReden("Vanaf 1 januari 2027 stijgt het plafond naar 61.000 euro.", om, ["2027-01-01"]), "getal niet in omschrijving, naam of datum: 61000");
});

test("maakLezerszin: GEEN wordt bewaard als marker, modelfout en afkeuring geven een reden", async () => {
  const { maakLezerszin } = await import("../lib/motor/lezerszin");
  const mod = (a: string | Error) => ({ tekst: async () => { if (a instanceof Error) throw a; return a; } });
  assert.deepEqual(await maakLezerszin("X", "De grenzen veranderen niet.", mod("GEEN")), { zin: GEEN_ZIN });
  const fout = await maakLezerszin("X", "Tarief 5 procent", mod(new Error("overbelast")));
  assert.equal(fout.zin, null);
  assert.match(String(fout.reden), /^modelfout/);
  const af = await maakLezerszin("X", "Tarief 5 procent", mod("Het tarief wordt 9 procent voor iedereen."));
  assert.equal(af.zin, null);
  assert.match(String(af.reden), /getal niet in omschrijving/);
  const goed = await maakLezerszin("X", "Tarief 5 procent vanaf 2027-01-01", mod("Vanaf 1 januari 2027 geldt een tarief van 5 procent."), "2027-01-01");
  assert.ok(goed.zin && goed.zin !== GEEN_ZIN);
});
