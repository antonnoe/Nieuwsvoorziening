import test from "node:test";
import assert from "node:assert/strict";
import { clusterItems, aantalBronnen } from "../lib/motor/cluster";
import { peilVoorselectie, peilKoppeling } from "../lib/motor/peil";
import { berekenScore, clusterRegime } from "../lib/motor/score";
import type { PeilParameter } from "../lib/motor/types";
import { item, klein } from "./helpers";

test("heuristische clustering groepeert dezelfde gebeurtenis uit twee bronnen", async () => {
  const a = item({ url: "https://a.test/1", bronId: "a", titel: "Marseille: grève des éboueurs, les ordures s'accumulent" });
  const b = item({ url: "https://b.test/1", bronId: "b", titel: "Grève des éboueurs à Marseille: les ordures s'entassent" });
  const c = item({ url: "https://c.test/1", bronId: "c", titel: "Tempête Ciaran: vigilance rouge en Bretagne" });
  const { clusters, gebruiktModel } = await clusterItems([a, b, c], null);
  assert.equal(gebruiktModel, false);
  assert.equal(clusters.length, 2);
  assert.equal(aantalBronnen(clusters.find((x) => x.items.length === 2)!), 2);
});

test("zelfde bron wordt niet met zichzelf gegroepeerd", async () => {
  const a = item({ url: "https://a.test/1", titel: "Grève des éboueurs à Marseille aujourd'hui" });
  const b = item({ url: "https://a.test/2", titel: "Grève des éboueurs à Marseille demain" });
  const { clusters } = await clusterItems([a, b], null);
  assert.equal(clusters.length, 2);
});

test("het model groepeert over talen heen; een kapot model laat de heuristiek staan", async () => {
  const fr = item({ url: "https://a.test/1", bronId: "a", taal: "fr", titel: "Les agriculteurs bloquent l'A64" });
  const nl = item({ url: "https://b.test/1", bronId: "b", taal: "nl", titel: "Franse boeren blokkeren snelweg bij Toulouse" });
  const goed = await clusterItems([fr, nl], klein(['{"groepen":[[1,2]]}']));
  assert.equal(goed.clusters.length, 1);
  assert.equal(goed.gebruiktModel, true);
  const kapot = await clusterItems([fr, nl], klein(["geen json"]));
  assert.equal(kapot.clusters.length, 2);
  assert.ok(kapot.fout);
});

const parameters: PeilParameter[] = [
  { id: "p.fr.acre", naam: "ACRE: reductie en duur", trefwoorden: "acre starterskorting sociale lasten starter", waarde_weergave: "75 procent", bron_url: "https://x.test", tools: [{ naam: "Starterstool", url: "https://t.test" }] },
  { id: "p.fr.csg", naam: "CSG tarief", trefwoorden: "csg sociale heffing", waarde_weergave: "9,2 procent" },
  { id: "p.nl.aow", naam: "AOW-leeftijd", trefwoorden: "aow pensioenleeftijd", waarde_weergave: "67 jaar" },
];

test("PEIL-voorselectie op trefwoorden", () => {
  const r = peilVoorselectie("De ACRE voor starters wordt aangepast", parameters);
  assert.equal(r[0].id, "p.fr.acre");
  assert.equal(peilVoorselectie("Het weer in de Provence", parameters).length, 0);
});

test("PEIL-koppeling: raakt en mogelijk gewijzigd, onbekende ids genegeerd, falen netjes", async () => {
  const client = klein(['{"raakt":["p.fr.acre","p.verzonnen"],"mogelijkGewijzigd":[{"id":"p.fr.acre","toelichting":"Bericht noemt 50 procent."}]}']);
  const r = await peilKoppeling({ kop: "ACRE voor starters", tekst: "De ACRE wordt aangepast" }, "", parameters, client);
  assert.deepEqual(r.koppeling.raakt.map((x) => x.id), ["p.fr.acre"]);
  assert.equal(r.koppeling.mogelijkGewijzigd.length, 1);
  assert.equal(r.koppeling.raakt[0].tools?.[0].naam, "Starterstool");
  const kapot = await peilKoppeling({ kop: "ACRE voor starters", tekst: "De ACRE wordt aangepast" }, "", parameters, klein(["onzin"]));
  assert.ok(kapot.fout);
  assert.deepEqual(kapot.koppeling.raakt, []);
  const zonder = await peilKoppeling({ kop: "ACRE", tekst: "ACRE starter" }, "", parameters, null);
  assert.deepEqual(zonder.koppeling.raakt, []);
});

test("score: overheid met één bron en meerdere kranten", () => {
  const nu = Date.now();
  const overheid = { sleutel: "o", items: [item({ regime: "overheid", bronId: "o", gepubliceerdOp: new Date(nu).toISOString() })] };
  assert.equal(clusterRegime(overheid), "overheid");
  assert.ok(berekenScore(overheid, 80, nu) >= 55);
  const drie = { sleutel: "d", items: ["a", "b", "c"].map((b) => item({ url: `https://x/${b}`, bronId: b, gepubliceerdOp: new Date(nu).toISOString() })) };
  assert.ok(berekenScore(drie, 80, nu) > berekenScore(overheid, 80, nu));
  const oud = { sleutel: "z", items: [item({ gepubliceerdOp: new Date(nu - 40 * 3600_000).toISOString() })] };
  assert.ok(berekenScore(oud, 0, nu) < 55);
});
